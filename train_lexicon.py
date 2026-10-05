#!/usr/bin/env python3
"""
train_lexicon.py · Học điểm cảm xúc của từ và cụm từ từ bình luận đã có nhãn.

Đầu vào : file CSV có 2 cột: bình luận và nhãn.
          Nhãn hợp lệ: Tích cực / Tiêu cực / Trung tính (hoặc pos / neg / neu).
          Nhãn số: 1 = tích cực, 0 = trung tính, -1 = tiêu cực.
          Bộ dữ liệu dùng quy ước số khác (ví dụ UIT-VSFC: 0 tiêu cực, 1 trung tính, 2 tích cực)
          thì dùng --map "0=Tiêu cực,1=Trung tính,2=Tích cực".
Đầu ra  : learned_lexicon.csv (cột word, score, df) để nạp bằng import_learned.js.

Cài đặt : pip install scikit-learn numpy
Chạy    : python train_lexicon.py data.csv
          python train_lexicon.py data.csv --text-col comment --label-col label --top 800
"""
import argparse
import csv
import re
import sys
import unicodedata

import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split

POS, NEG, NEU = 'Tích cực', 'Tiêu cực', 'Trung tính'
ALIASES = {
    'tích cực': POS, 'tich cuc': POS, 'pos': POS, 'positive': POS, '1': POS,
    'tiêu cực': NEG, 'tieu cuc': NEG, 'neg': NEG, 'negative': NEG, '-1': NEG,
    'trung tính': NEU, 'trung tinh': NEU, 'neu': NEU, 'neutral': NEU, '0': NEU,
}

TOKEN_RE = re.compile(r'[^\W_]+|[^\s\w]')


def tokenize(text):
    """Giống hàm tokenize trong script.js để từ học được khớp với từ khi chấm điểm."""
    t = unicodedata.normalize('NFC', text.lower())
    t = re.sub('[️‍\U0001F3FB-\U0001F3FF]', '', t)
    t = re.sub(r'(?<![^\W\d_])([kh])\1{2,}(?![^\W\d_])', 'haha', t)   # kkk, hhh = tiếng cười
    t = re.sub(r'([^\W\d_])\1{2,}', r'\1', t)                          # đẹppp -> đẹp
    return TOKEN_RE.findall(t)


def parse_map(s):
    m = {}
    for part in filter(None, (p.strip() for p in s.split(','))):
        k, _, v = part.partition('=')
        label = ALIASES.get(v.strip().lower())
        if not label:
            sys.exit(f'--map: không hiểu nhãn "{v}". Dùng Tích cực, Tiêu cực hoặc Trung tính.')
        m[k.strip().lower()] = label
    return m


def read_data(path, text_col, label_col, custom_map):
    texts, labels, skipped = [], [], 0
    with open(path, encoding='utf-8-sig', newline='') as f:
        rd = csv.DictReader(f)
        if text_col not in (rd.fieldnames or []) or label_col not in (rd.fieldnames or []):
            sys.exit(f'Không thấy cột "{text_col}" hoặc "{label_col}". Các cột có trong file: {rd.fieldnames}')
        for row in rd:
            raw = (row[label_col] or '').strip().lower()
            label = custom_map.get(raw) or ALIASES.get(raw)
            text = (row[text_col] or '').strip()
            if not label or not text:
                skipped += 1
                continue
            texts.append(text)
            labels.append(label)
    return texts, labels, skipped


def make_vectorizer(min_df):
    return CountVectorizer(tokenizer=tokenize, lowercase=False, token_pattern=None,
                           ngram_range=(1, 3), min_df=min_df, binary=True)


def make_model(C):
    return LogisticRegression(C=C, max_iter=3000, class_weight='balanced')


def term_scores(clf):
    """Điểm của mỗi từ = mức độ nó nghiêng về tích cực so với tiêu cực."""
    classes = list(clf.classes_)
    if POS not in classes or NEG not in classes:
        sys.exit('Dữ liệu cần có cả bình luận tích cực lẫn tiêu cực.')
    if len(classes) == 2:
        w = clf.coef_[0] if classes[1] == POS else -clf.coef_[0]
    else:
        w = clf.coef_[classes.index(POS)] - clf.coef_[classes.index(NEG)]
    scale = np.percentile(np.abs(w), 99)
    s = np.clip(w * (3.0 / scale if scale > 0 else 1.0), -4, 4)
    return np.round(s * 2) / 2          # làm tròn 0.5 cho giống từ điển hiện tại


def valid_term(term):
    tokens = term.split(' ')
    if len(term) > 40:
        return False
    if any(len(t) == 1 and ord(t) < 128 and not t.isalnum() for t in tokens):   # có dấu câu
        return False
    if all(t.isdigit() for t in tokens):
        return False
    return any(ch.isalpha() or ord(ch) > 0x2000 for ch in term)               # có chữ hoặc emoji


def main():
    ap = argparse.ArgumentParser(description='Học điểm cảm xúc cho từ điển từ dữ liệu có nhãn.')
    ap.add_argument('csv')
    ap.add_argument('--text-col', default='binh_luan')
    ap.add_argument('--label-col', default='nhan')
    ap.add_argument('--map', default='', help='ví dụ: "0=Tiêu cực,1=Trung tính,2=Tích cực"')
    ap.add_argument('--min-df', type=int, default=3, help='từ phải xuất hiện ít nhất N bình luận')
    ap.add_argument('--C', type=float, default=1.0, help='nhỏ hơn = chống học vẹt mạnh hơn')
    ap.add_argument('--top', type=int, default=500, help='số từ giữ lại (điểm lệch nhiều nhất)')
    ap.add_argument('--min-abs', type=float, default=1.0, help='bỏ từ có |điểm| nhỏ hơn mức này')
    ap.add_argument('--out', default='learned_lexicon.csv')
    args = ap.parse_args()

    texts, labels, skipped = read_data(args.csv, args.text_col, args.label_col, parse_map(args.map))
    counts = {l: labels.count(l) for l in (POS, NEU, NEG)}
    print(f'Đọc {len(texts)} bình luận (bỏ qua {skipped} dòng thiếu chữ hoặc nhãn lạ): {counts}')
    if len(texts) < 200:
        print('Cảnh báo: dưới 200 bình luận thì kết quả không đáng tin. Nên có từ vài nghìn trở lên.')

    # 1. Đo độ chính xác trên 20% dữ liệu giữ lại, mô hình chưa thấy các dòng này
    try:
        Xtr_t, Xte_t, ytr, yte = train_test_split(texts, labels, test_size=0.2, random_state=42, stratify=labels)
    except ValueError:
        Xtr_t, Xte_t, ytr, yte = train_test_split(texts, labels, test_size=0.2, random_state=42)
    vec = make_vectorizer(args.min_df)
    clf = make_model(args.C).fit(vec.fit_transform(Xtr_t), ytr)
    pred = clf.predict(vec.transform(Xte_t))
    print(f'\nĐộ chính xác trên tập kiểm tra: {accuracy_score(yte, pred):.3f} | F1 trung bình: {f1_score(yte, pred, average="macro"):.3f}')
    print(classification_report(yte, pred, zero_division=0))

    # 2. Huấn luyện lại trên toàn bộ dữ liệu để lấy điểm từ
    vec = make_vectorizer(args.min_df)
    X = vec.fit_transform(texts)
    clf = make_model(args.C).fit(X, labels)
    scores = term_scores(clf)
    df = np.asarray(X.sum(axis=0)).ravel()
    terms = vec.get_feature_names_out()

    rows = [(t, float(s), int(d)) for t, s, d in zip(terms, scores, df)
            if abs(s) >= args.min_abs and valid_term(t)]
    rows.sort(key=lambda r: -abs(r[1]))
    rows = rows[:args.top]

    with open(args.out, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(['word', 'score', 'df'])
        w.writerows(rows)

    print(f'Đã ghi {len(rows)} từ vào {args.out}. Nên đọc lướt file này trước khi nạp.')
    for name, sign in (('tích cực', 1), ('tiêu cực', -1)):
        top = [r for r in rows if r[1] * sign > 0][:12]
        print(f'  Top {name}: ' + ', '.join(f'{t} ({s:+g})' for t, s, _ in top))


if __name__ == '__main__':
    main()
