import { DURATION, LATE_LIMIT, nextDaily, dueBetween, countdown } from './schedule.js';
import { openDatabase, putRecording, listRecordings, saveChunk, getBlob, deleteRecording } from './storage.js';
const $ = id => document.getElementById(id);
const formatDate = ms => new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
const size = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
let stream, wake, preparing = false, armed = false, testSlot = null, session = null;
let lastTick = Date.now(), dbReady = false, persistGranted = false, ownsPage = false;
const handledSlots = new Set();
let events = [];
const urls = new Set();
try { events = JSON.parse(localStorage.getItem('medaka-history') || '[]'); if (!Array.isArray(events)) events = []; } catch { /* storage may be unavailable */ }
function history(message, type = '情報') {
  events.unshift({ at: Date.now(), message, type });
  events = events.slice(0, 200);
  try { localStorage.setItem('medaka-history', JSON.stringify(events)); } catch { $('message').textContent = '履歴を永続保存できません。Safariの保存設定を確認してください。'; }
  renderHistory();
}
function renderHistory() {
  $('history').replaceChildren(...events.map(e => { const li = document.createElement('li'); li.textContent = `${formatDate(e.at)} ｜ ${e.type}：${e.message}`; return li; }));
}
function warn(message) { $('message').textContent = message; }
function errorText(e) { return `${e?.name || 'Error'}: ${e?.message || String(e)}`; }
function healthy() { const track = stream?.getVideoTracks()[0]; return track?.readyState === 'live' && !track.muted && document.visibilityState === 'visible'; }
function render() {
  const ready = ownsPage && healthy() && dbReady && !preparing;
  $('prepare').disabled = !ownsPage || preparing || !!session;
  $('release').disabled = !stream || !!session;
  $('arm').disabled = !ready || armed || !!session;
  $('disarm').disabled = !armed && !testSlot;
  $('test').disabled = !ready || !!session || !!testSlot;
  $('stop').disabled = !session || session.stopping;
  $('status').textContent = session ? (session.stopping ? '保存処理中' : '● 録画中') : armed ? '予約待機中' : ready ? '準備完了' : '準備前';
}
async function acquireWake() {
  if (!('wakeLock' in navigator)) { $('wakeInfo').textContent = '画面点灯維持：非対応。iPhoneの自動ロックを「なし」にしてください'; return; }
  if (wake && !wake.released) return;
  try {
    wake = await navigator.wakeLock.request('screen');
    $('wakeInfo').textContent = '画面点灯維持：取得済み（OSによる解除の可能性あり）';
    wake.addEventListener('release', () => { $('wakeInfo').textContent = '画面点灯維持：解除されました。自動ロック設定を確認してください'; history('画面点灯維持が解除されました', '注意'); });
  } catch (e) { $('wakeInfo').textContent = '画面点灯維持：取得できません。自動ロックを「なし」にしてください'; history(errorText(e), '画面点灯維持'); }
}
async function updateStorage() {
  try {
    const estimate = await navigator.storage?.estimate();
    $('storageInfo').textContent = estimate?.quota ? `Safari内使用量 ${size(estimate.usage || 0)} / 上限目安 ${size(estimate.quota)}。永続化：${persistGranted ? '許可' : '未許可・削除される可能性あり'}` : '保存容量の見積もりは取得できません。端末の空き容量を確認してください。';
  } catch { $('storageInfo').textContent = '保存容量を取得できません'; }
}
function disableSchedule(reason) {
  if (armed || testSlot) history(reason, '予約解除');
  armed = false; testSlot = null; render();
}
function cameraFailure(reason) {
  warn(reason); disableSchedule(reason); history(reason, '失敗');
  if (session) stopRecording(reason, 'interrupted');
  render();
}
async function closeCamera() {
  disableSchedule('カメラを閉じました');
  if (stream) { const old = stream; stream = null; old.getTracks().forEach(t => t.stop()); }
  $('preview').srcObject = null; $('previewHint').hidden = false;
  if (wake && !wake.released) await wake.release();
  render();
}
async function prepare() {
  if (!ownsPage || preparing || session) return;
  preparing = true; render(); warn('');
  try {
    await closeCamera();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('カメラにはHTTPSのSafariが必要です');
    if (!window.MediaRecorder) throw new Error('このブラウザはMediaRecorderに対応していません');
    await openDatabase(); dbReady = true;
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } });
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => cameraFailure('カメラの映像が終了しました。再度準備してください'));
    track.addEventListener('mute', () => cameraFailure('カメラの映像が一時停止しました。ロック・割込みなどの可能性があります'));
    $('preview').srcObject = stream;
    await $('preview').play(); $('previewHint').hidden = true;
    const settings = track.getSettings();
    $('cameraInfo').textContent = `実際の設定：${settings.width || '?'} × ${settings.height || '?'} / ${settings.frameRate?.toFixed(1) || '?'}fps（実効fps・画質は保証されません）`;
    if (settings.facingMode && settings.facingMode !== 'environment') warn('背面カメラを選択できませんでした。プレビューとSafariのカメラ設定を確認してください。');
    await acquireWake();
    try { persistGranted = await navigator.storage?.persist?.() || false; } catch { /* optional */ }
    history('カメラと端末内保存を準備しました');
  } catch (e) { await closeCamera(); warn(`準備に失敗しました。カメラ許可・別アプリの使用状況・空き容量を確認してください。\n${errorText(e)}`); history(errorText(e), '準備失敗'); }
  finally { preparing = false; render(); await updateStorage(); }
}
function mimeOptions() {
  return ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
}
async function startRecording(slot) {
  if (session) { history('別の録画中のため開始できませんでした', '失敗'); return; }
  if (!healthy()) { cameraFailure('予約時刻にカメラが利用できませんでした'); return; }
  // Set the guard before any asynchronous operation.
  const current = { slot, record: null, recorder: null, queue: Promise.resolve(), pendingBytes: 0, seq: 0, stopping: false, failed: false, reason: '', outcome: 'complete', startedMono: performance.now() };
  session = current; render();
  try {
    const estimate = await navigator.storage?.estimate();
    if (estimate?.quota && estimate.quota - estimate.usage < 600 * 1024 * 1024) throw new Error('Safari内の空き容量が600MB未満です。動画を書き出して削除してください');
    if (!healthy() || current.stopping) throw new Error('開始処理中にカメラまたは画面が利用不可になりました');
    const mime = mimeOptions();
    const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2000000 });
    current.recorder = recorder;
    current.record = { id: crypto.randomUUID(), started: Date.now(), plannedEnd: slot.at + slot.duration, mime: recorder.mimeType || mime || 'video/mp4', bytes: 0, chunks: 0, status: 'recording', kind: slot.kind };
    await putRecording(current.record);
    if (!healthy() || current.stopping) throw new Error('録画開始前に待機が中断されました');
    recorder.ondataavailable = event => {
      if (!event.data.size || current.failed) return;
      const blob = event.data, seq = current.seq++;
      current.pendingBytes += blob.size;
      current.queue = current.queue.then(async () => {
        if (current.failed) return;
        const updated = { ...current.record, bytes: current.record.bytes + blob.size, chunks: current.record.chunks + 1, mime: blob.type || current.record.mime };
        await saveChunk(updated, seq, blob);
        current.record = updated;
      }).catch(e => {
        current.failed = true; warn(`端末内への保存に失敗しました。保存済み部分だけ残る可能性があります。${errorText(e)}`);
        history(errorText(e), '保存失敗'); disableSchedule('保存に失敗しました'); stopRecording('端末内保存に失敗', 'failed');
      }).finally(() => { current.pendingBytes -= blob.size; });
      if (current.pendingBytes > 64 * 1024 * 1024) {
        disableSchedule('保存処理が追いつきません'); stopRecording('保存処理が追いつかないため中断しました', 'interrupted');
      }
    };
    recorder.onerror = event => { current.failed = true; history(errorText(event.error || '録画エラー'), '失敗'); disableSchedule('録画エラー'); stopRecording('MediaRecorderエラー', 'failed'); };
    recorder.onstop = () => finalize(current);
    recorder.start(5000);
    history(`${slot.kind}録画開始。予定終了 ${formatDate(current.record.plannedEnd)}`, '開始');
    warn(''); render(); await renderRecordings();
  } catch (e) {
    current.failed = true;
    if (current.record) { current.record.status = 'failed'; current.record.reason = errorText(e); try { await putRecording(current.record); } catch { /* already reported below */ } }
    session = null; disableSchedule('録画を開始できませんでした'); history(errorText(e), '開始失敗'); warn(`録画を開始できませんでした。${errorText(e)}`); render();
  }
}
function stopRecording(reason, outcome = 'complete') {
  const current = session;
  if (!current || current.stopping) return;
  current.stopping = true; current.reason = reason; current.outcome = outcome;
  if (current.recorder?.state === 'recording' || current.recorder?.state === 'paused') {
    current.recorder.stop();
    current.watchdog = setTimeout(() => {
      if (session === current) { warn('録画停止後の応答がありません。保存済み部分は再読込後に確認できます。'); disableSchedule('録画の終了応答がありません'); history('停止後の応答なし。完全な動画かどうか確認が必要です', '失敗'); }
    }, 20000);
  }
  render();
}
async function finalize(current) {
  clearTimeout(current.watchdog);
  if (!current.stopping) { current.reason = '録画が予期せず終了しました'; current.outcome = 'interrupted'; disableSchedule(current.reason); }
  await current.queue;
  current.record.status = current.failed || !current.record.bytes ? 'failed' : current.outcome;
  current.record.ended = Date.now(); current.record.reason = current.reason;
  try { await putRecording(current.record); }
  catch (e) { current.record.status = 'failed'; warn(`終了情報の保存に失敗しました。${errorText(e)}`); history(errorText(e), '保存失敗'); disableSchedule('終了情報の保存失敗'); }
  history(`${current.reason}。保存済み ${size(current.record.bytes)}${current.record.status !== 'complete' ? '（不完全な可能性あり）' : ''}`, current.record.status === 'complete' ? '終了' : '失敗・中断');
  session = null; render(); await renderRecordings(); await updateStorage();
}
function tick() {
  const now = Date.now();
  if (session && !session.stopping && now - lastTick > 15000) {
    disableSchedule('15秒以上の処理停止・時刻変更を検出しました');
    stopRecording('処理停止・時刻変更により映像の連続性を確認できません', 'interrupted');
  }
  if (session && !session.stopping && session.record) {
    const remaining = Math.min(session.record.plannedEnd - now, session.slot.duration - (performance.now() - session.startedMono));
    $('recordInfo').textContent = `録画中：残り ${countdown(remaining)} / 保存済み ${size(session.record.bytes)}`;
    if (remaining <= 0) stopRecording('予定時刻で自動停止');
  } else $('recordInfo').textContent = session ? '保存処理中です。画面を閉じないでください' : '録画していません';
  if (armed) {
    for (const slot of dueBetween(lastTick, now)) {
      if (handledSlots.has(slot.id)) continue;
      handledSlots.add(slot.id);
      if (now - slot.at > LATE_LIMIT) history(`${formatDate(slot.at)} の予約は、待機中の処理遅延により撮影できませんでした`, '失敗');
      else startRecording(slot);
    }
  }
  if (testSlot && now >= testSlot.at) {
    const slot = testSlot; testSlot = null;
    if (now - slot.at > LATE_LIMIT) history('テスト予約は処理遅延により撮影できませんでした', '失敗');
    else startRecording(slot);
    render();
  }
  const next = [armed ? nextDaily(now) : null, testSlot].filter(Boolean).sort((a,b) => a.at-b.at)[0];
  $('nextLabel').textContent = next ? `次の${next.kind}撮影：${formatDate(next.at)}` : '予約は無効です';
  $('countdown').textContent = next ? countdown(next.at - now) : '--:--:--';
  lastTick = now;
}
async function renderRecordings() {
  try {
    const records = (await listRecordings()).sort((a,b) => b.started-a.started);
    const nodes = records.map(record => {
      const box = document.createElement('div'); box.className = 'record';
      const title = document.createElement('strong'); title.textContent = `${formatDate(record.started)} ｜ ${record.kind}`;
      const detail = document.createElement('p');
      const labels = { complete: '録画終了・保存済み（再生を確認してください）', recording: '録画中', interrupted: '中断・不完全な可能性あり', failed: '失敗・不完全な可能性あり' };
      detail.textContent = `${labels[record.status]} / ${size(record.bytes)} / ${record.chunks}断片${record.reason ? ` / ${record.reason}` : ''}`;
      const exportButton = document.createElement('button'); exportButton.className = 'secondary'; exportButton.textContent = '再生・書き出しを準備';
      exportButton.disabled = !!session || !record.bytes;
      exportButton.onclick = async () => {
        if (session) { warn('録画の終了後に書き出してください'); return; }
        exportButton.disabled = true;
        try {
          const blob = await getBlob(record);
          const url = URL.createObjectURL(blob); urls.add(url);
          const extension = record.mime.includes('mp4') ? 'mp4' : 'webm';
          const filename = `medaka-${new Date(record.started).toISOString().replace(/[:.]/g,'-')}.${extension}`;
          const video = document.createElement('video'); video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.src = url;
          const link = document.createElement('a'); link.href = url; link.download = filename; link.textContent = '動画を書き出す（ダウンロード）';
          box.append(video, link);
          const file = new File([blob], filename, { type: record.mime });
          if (navigator.canShare?.({ files: [file] })) {
            const share = document.createElement('button'); share.textContent = '共有して「ファイル」などに保存'; share.className = 'secondary';
            share.onclick = async () => { try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') warn(`共有に失敗しました。${errorText(e)}`); } };
            box.append(share);
          }
          exportButton.remove();
        } catch (e) { exportButton.disabled = false; warn(`書き出しの準備に失敗しました。端末のメモリ・保存データを確認してください。${errorText(e)}`); }
      };
      const remove = document.createElement('button'); remove.className = 'danger'; remove.textContent = '端末内のこの動画を削除'; remove.disabled = !!session;
      remove.onclick = async () => {
        if (session) { warn('録画中は削除できません'); return; }
        if (!confirm('書き出した動画を確認しましたか？Safari内のこの動画を完全に削除します。')) return;
        try { await deleteRecording(record.id); await renderRecordings(); await updateStorage(); } catch (e) { warn(errorText(e)); }
      };
      box.append(title, detail, exportButton, remove); return box;
    });
    urls.forEach(url => URL.revokeObjectURL(url)); urls.clear();
    $('recordings').replaceChildren(...nodes);
    if (!records.length) $('recordings').textContent = '保存された動画はありません';
  } catch (e) { warn(`端末内の動画一覧を開けません。${errorText(e)}`); }
}
$('prepare').onclick = prepare;
$('release').onclick = closeCamera;
$('arm').onclick = () => { if (!healthy()) return; armed = true; lastTick = Date.now(); history('毎日9時・17時の予約を有効にしました'); acquireWake(); render(); tick(); };
$('disarm').onclick = () => { disableSchedule('使用者が予約を解除しました（進行中の録画は継続）'); tick(); };
$('test').onclick = () => { if (!healthy() || session) return; testSlot = { id: `test-${Date.now()}`, at: Date.now()+60000, duration: 30000, kind: 'テスト' }; history('1分後に30秒間のテスト録画を予約しました'); render(); tick(); };
$('stop').onclick = () => stopRecording('使用者が途中停止しました', 'interrupted');
$('refresh').onclick = renderRecordings;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    disableSchedule('画面が非表示になりました。ロック・アプリ切替などの可能性があります');
    if (stream) history('画面が非表示。OSから停止原因は取得できません', '中断');
    stopRecording('画面が非表示になったため中断しました', 'interrupted');
  } else { if (stream) acquireWake(); render(); tick(); }
});
window.addEventListener('pagehide', () => { disableSchedule('ページを離れました'); stopRecording('ページを離れたため中断しました', 'interrupted'); });
window.addEventListener('beforeunload', event => { if (session) { event.preventDefault(); event.returnValue = ''; } });
async function init() {
  renderHistory(); render();
  try {
    if (!navigator.locks) throw new Error('複数タブの競合防止に必要なWeb Locks APIがありません。iOS 18のSafariを使用してください');
    ownsPage = await new Promise((resolve, reject) => {
      navigator.locks.request('medaka-recorder-page', { ifAvailable: true }, lock => {
        resolve(!!lock);
        if (lock) return new Promise(() => {});
      }).catch(reject);
    });
    if (!ownsPage) throw new Error('別のタブでこのアプリが開いています。そちらを閉じ、このページを再読込してください');
    await openDatabase(); dbReady = true;
    for (const record of await listRecordings()) {
      if (record.status === 'recording') {
        record.status = 'interrupted'; record.reason = '前回の録画終了を確認できません。ページ終了・OS停止などの可能性があります';
        await putRecording(record); history(`${formatDate(record.started)}：${record.reason}`, '復旧');
      }
    }
    await renderRecordings();
  } catch (e) { warn(`保存機能を利用できません。プライベートブラウズを避け、Safariの保存設定を確認してください。${errorText(e)}`); }
  await updateStorage(); render(); tick(); setInterval(tick, 500);
}
init();
