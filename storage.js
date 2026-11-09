let database;
export async function openDatabase() {
  if (database) return database;
  database = await new Promise((resolve, reject) => {
    const req = indexedDB.open('medaka-ios-recorder', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('recordings', { keyPath: 'id' });
      const chunks = req.result.createObjectStore('chunks', { keyPath: ['id', 'seq'] });
      chunks.createIndex('recording', 'id');
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('別のタブを閉じて再読込してください'));
    req.onsuccess = () => resolve(req.result);
  });
  return database;
}
async function transaction(stores, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error || new Error('端末内保存に失敗しました'));
    tx.onabort = () => reject(tx.error || new Error('保存が中断されました'));
    try { result = action(tx); } catch (e) { tx.abort(); reject(e); }
  });
}
export const putRecording = record => transaction(['recordings'], 'readwrite', tx => tx.objectStore('recordings').put(record));
export const listRecordings = () => transaction(['recordings'], 'readonly', tx => tx.objectStore('recordings').getAll());
export async function saveChunk(record, seq, blob) {
  await transaction(['recordings', 'chunks'], 'readwrite', tx => {
    tx.objectStore('chunks').put({ id: record.id, seq, blob });
    tx.objectStore('recordings').put(record);
  });
}
export async function getBlob(record) {
  const chunks = await transaction(['chunks'], 'readonly', tx => tx.objectStore('chunks').index('recording').getAll(record.id));
  if (!chunks.length) throw new Error('保存済みデータがありません');
  return new Blob(chunks.sort((a,b) => a.seq - b.seq).map(c => c.blob), { type: record.mime });
}
export async function deleteRecording(id) {
  await transaction(['recordings', 'chunks'], 'readwrite', tx => {
    tx.objectStore('recordings').delete(id);
    const req = tx.objectStore('chunks').index('recording').openCursor(IDBKeyRange.only(id));
    req.onsuccess = () => { const cursor = req.result; if (cursor) { cursor.delete(); cursor.continue(); } };
  });
}
