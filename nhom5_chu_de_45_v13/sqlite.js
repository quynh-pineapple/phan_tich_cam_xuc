/* =========================================================
   sqlite.js · Lớp bọc node:sqlite (có sẵn trong Node.js 22.13+ / 24)
   Giả lập phần API của better-sqlite3 mà dự án dùng:
   new Database(file), .pragma(), .exec(), .prepare().get/all/run(), .transaction()
   => không cần cài thêm thư viện native, không cần Visual Studio / node-gyp.
   ========================================================= */
'use strict';
const { DatabaseSync } = require('node:sqlite');

class Database {
  constructor(file) {
    this._db = new DatabaseSync(file);
    this._depth = 0;
  }
  pragma(str) { return this._db.prepare('PRAGMA ' + str).all(); }
  exec(sql) { this._db.exec(sql); return this; }
  prepare(sql) {
    const st = this._db.prepare(sql);
    return {
      get: (...a) => st.get(...a),
      all: (...a) => st.all(...a),
      run: (...a) => st.run(...a),
    };
  }
  transaction(fn) {
    return (...args) => {
      const outer = this._depth === 0;
      const sp = 'sp' + this._depth;
      this._db.exec(outer ? 'BEGIN' : 'SAVEPOINT ' + sp);
      this._depth++;
      try {
        const r = fn(...args);
        this._depth--;
        this._db.exec(outer ? 'COMMIT' : 'RELEASE ' + sp);
        return r;
      } catch (e) {
        this._depth--;
        this._db.exec(outer ? 'ROLLBACK' : 'ROLLBACK TO ' + sp);
        throw e;
      }
    };
  }
  close() { this._db.close(); }
}
module.exports = Database;
