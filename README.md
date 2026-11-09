# めだかの時間 — iPhone用予約撮影

iPhone SE（第2世代）・iOS 18.3.1のSafariを対象にした、日本語の静的Webアプリです。Mac・Xcode・サーバー・アカウント登録は不要です。背面カメラ**1台の同じ画角に水槽2つを収めて**、毎日 **09:00〜09:30 / 17:00〜17:30（日本時間固定）** に録画します。2つのカメラの同時使用や、水槽別の動画生成ではありません。音声は収録しません。

**Safariを前面に開き、画面を点灯したまま使う「条件付き予約撮影」です。iOS上の確実な無人・連日撮影は保証できません。** OSによる停止やデータ消失が許されない用途には、専用の録画機器が必要です。

## できること・保証できないこと

| 項目 | 実装・条件・限界 |
| --- | --- |
| カメラ | ボタン操作で事前にカメラ許可を取得し、背面映像をプレビュー。HTTPSが必要です。背面を優先要求しますが、必ずプレビューを確認してください。 |
| 予約 | ページが動作中、0.5秒ごとに日本時間の9時・17時を判定。タップして予約を有効にする必要があります。OSのアラームではありません。時刻変更・スリープ・処理遅延により欠落・遅延します。 |
| 30分停止 | 予定開始から30分後に停止要求。開始が少し遅れても9:30/17:30で停止します。実時刻と単調増加時計を使いますが、OSが処理を止めると正確な停止時刻は保証できません。 |
| 遅延・競合 | 開始時刻から30秒を超えた予約は失敗としてスキップ。別の録画と重なる予約も失敗として記録。過去の予約の追い撮りはしません。複数タブはWeb Locksで排他制御します。 |
| 720p・30fps | 1280×720・最大30fpsを優先要求し、実際の設定を表示。エンコーダーには2Mbpsを目標として指定します。解像度・実効fps・ビットレート・発熱・ドロップフレームは保証できません。 |
| 保存 | 約5秒間隔でMediaRecorderの断片をIndexedDBへ逐次保存。動画は端末のSafari内に置き、外部サーバーに送信しません。**「写真」「ファイル」への無操作保存ではありません。** |
| 書き出し | 録画終了後に「再生・書き出しを準備」→ダウンロード、または対応環境の共有シートから「ファイルに保存」。写真への保存は共有先の対応次第。ユーザー操作が必要です。 |
| 長時間待機 | Screen Wake Lockを要求しますが、低電力モード・OS判断・非表示などで解除されることがあります。iOSの自動ロック設定も必ず変更してください。バックグラウンド実行・ロック中録画・自動復帰は提供できません。 |
| 非表示・障害 | 非表示、カメラのmute/ended、録画エラー、保存失敗を検知すると記録し、予約を解除。録画中なら途中停止します。非表示イベントの処理さえ実行されない場合があります。 |
| 異常終了 | 未完了の保存レコードを次回起動時に「中断」とします。ロックかOS強制終了かを特定できません。最後の未保存断片・履歴は失われる可能性があります。 |
| データ保持 | 永続ストレージを要求し、結果を表示します。許可されても端末故障や利用者による削除は防げません。空き容量不足・Safariのサイトデータ消去・非利用サイトの削除・プライベートブラウズによってデータが失われます。 |

SafariはMediaRecorderをサポートしていますが、実行時にもMP4/H.264等の対応形式を確認します。MP4を優先し、非対応ならWebM等へフォールバックします。断片は1回の連続したMediaRecorderから出力された順で連結します。**中断されたMP4は終端情報がなく、保存済みでも再生できない場合があります。** 保存済み表示は動画内容・完全性を保証しません。

動画全体をメモリにため続けないよう逐次保存しますが、Safariの断片イベント間隔は厳密ではありません。カメラの一時停止などで巨大な断片になる場合があり、メモリ使用量を完全には制限できません。未保存の待ち行列が64MiBを超えた場合は中断を要求します。書き出し時は動画全体をメモリへ読み込むため、iPhone SEのメモリでは30分動画の書き出しに失敗する可能性があります。

2Mbpsを仮定すると30分は約450MB、1日2回で約900MBです（実際は変動）。開始前にSafari内の空き容量目安が600MiB未満なら開始を拒否しますが、見積もりは実際に使える空き容量の保証ではありません。十分な端末空き容量を確保し、こまめに書き出してください。自動削除・自動上書きは行いません。

## GitHub Pagesへ公開する（Mac不要）

アプリ本体は `index.html`、`style.css`、`app.js`、`schedule.js`、`storage.js` の5ファイルだけです。外部CDN・解析・アップロード処理は使いません。CSPの `connect-src 'none'` でも通信APIを制限しています（初回ページ取得・GitHubへの説明リンク遷移はネットワークを使います）。

1. このリポジトリ `kohaochagasuki-svg/medaka-ios-recorder` の `main` に実装ファイルと `.github/workflows/pages.yml` を反映します。別リポジトリの `medaka-observer` / `medaka-auto-recorder` は使用しません。
2. GitHubのリポジトリ画面 → **Settings → Pages → Build and deployment → Source: GitHub Actions** を選択します。設定変更にはリポジトリ管理権限が必要です。利用プラン・公開範囲によってPagesの可否が変わります。
3. **Actions → Deploy GitHub Pages → Run workflow → main** を実行します。その後は `main` へのpushで再公開されます。
4. ワークフローの `deploy` 成功を確認し、GitHubが表示するPagesのURLをSafariで開きます。通常のURLは `https://kohaochagasuki-svg.github.io/medaka-ios-recorder/` です。これは公開成功を確認するまでは予定URLです。
5. iPhoneでカメラ許可と下記のテストを実施してください。HTTPSのトップレベルのページで開き、GitHubのファイル閲覧画面内では実行しないでください。

ワークフローは予約単体テスト後、5ファイルだけをPagesに配信します。サブディレクトリでも動作する相対パスです。Pagesには動画・履歴をアップロードしません。ソースやデモの公開と、端末内動画の保存は独立しています。公開設定・Actions権限に問題がある場合は、Actionsの失敗ログとSettingsのPages設定を確認してください。

## iPhoneでの使い方

1. Safariの通常タブでHTTPSのアプリを開きます。複数タブで起動しないでください。ホーム画面追加・プライベートブラウズは推奨しません。iOS 18.3.1ではホーム画面WebアプリのWake Lockに既知の制限があるため、**Safariのタブ**を使います。
2. iPhoneの **設定 → 画面表示と明るさ → 自動ロック → なし** に変更し、低電力モードをオフにします。充電器をつなぎ、直射日光や高温を避けて固定します。設定は使用後に戻してください。
3. **① カメラを許可・準備する** → 許可。背面プレビューで水槽2つが見えること、表示画質、画面点灯維持、保存容量を確認します。カメラが拒否される場合はSafariのサイト設定から許可し、カメラを使用する他のアプリを閉じます。
4. **1分後にテスト録画（30秒間）** をタップ。実時間で1分待って開始し、30秒後に停止・保存されることを確認します。1分後テストは毎日の予約とは独立しています。毎日の予約と重なる時刻には実行しないでください。
5. 端末内の動画から **再生・書き出しを準備** を押し、再生できることを確認。**動画を書き出す** または **共有して「ファイル」などに保存** を押します。iOSのUIに従って保存し、「ファイル」で開けることを確認します。ダウンロードリンクが再生画面になる場合は、その画面の共有ボタンから保存してください。
6. **② 毎日の予約を有効にする** をタップ。次の撮影時刻とカウントダウンを確認し、Safariの画面をそのまま維持します。予約を入れた時点で過ぎている時刻は翌回から有効です（9:05に有効化しても9時の撮影は始まりません）。
7. 不在利用の前に、同じiPhoneで **実際の30分録画・書き出し** と、9時から17時までの長時間待機を試してください。通知・着信・充電・温度・容量・自動ロックの影響を実機で確認する必要があります。
8. 戻ったら履歴と動画を確認し、書き出してバックアップ。書き出しを確認後に端末内の動画を削除します。履歴は直近200件です。

「予約を解除する」は今後の予約だけを解除し、録画中の動画は継続します。「録画を停止する」は進行中の録画を中断します（毎日の予約は継続）。カメラを閉じると予約も解除します。画面ロック・アプリ切替・ページ離脱後は安全のため予約を解除し、前面に戻しても自動で再開しません。再読込後も予約は無効です。カメラを再度準備して予約を有効にしてください。

別サイトデータと保存領域を共有しうるGitHub Pagesの同一オリジンでは、他のアプリのサイトデータも容量に含まれます。このアプリの削除ボタンは専用DB内の指定動画だけを削除します。Safariの「Webサイトデータを消去」は他の同一オリジンのアプリにも影響するため注意してください。

## 開発・検証

ランタイム依存なし。既存のチェックアウトをそのまま利用できます。

```sh
cd /workspace/medaka-ios-recorder
npm test                         # Node.js 24で予約ロジックをテスト（依存インストール不要）
python3 -m http.server 8000 --bind 127.0.0.1
```

ローカルPCでは `http://localhost:8000`、iPhoneではHTTPSのPagesで検証してください。iPhoneからPCの通常のHTTPアドレスへ接続してもカメラは許可されません。

ブラウザ統合テスト：Python 3、Node.js、Chromiumが必要です。

```sh
npm ci
# /usr/bin/chromium があるLinux環境
npm run test:browser
# 別のChromiumを使う場合
CHROMIUM_PATH=/path/to/chromium npm run test:browser
```

約2分かかります。Playwrightはテスト用のみで、配信アプリに含めません。ブラウザ統合テストはローカルHTTPサーバーを自動起動・終了します。`test-results/` に375×667画面のスクリーンショットと録画ダウンロードを出力します。`npm ci` のキャッシュ書込が制限される環境では `npm ci --cache /tmp/medaka-npm-cache` を使用してください。

検証の範囲：

- 単体テスト：日本時間の9時・17時、翌日・年またぎ、同一予約の再実行防止、遅延時の候補、カウントダウン。
- Chromium統合：疑似カメラを本物のgetUserMedia/MediaRecorderに渡し、実時間1分待機→30秒録画→自動停止→IndexedDB保存→再生→ダウンロード。再読込後の保持・複数タブ排他・非表示中断・カメラ拒否も検証。
- 模擬時計・模擬MediaRecorder：17時開始・30分停止・容量不足の失敗処理・予約解除。30分のテストは実動画の長時間録画試験ではありません。
- 異常終了を想定した未完了レコードの復旧。外部リクエストがないことを検証。

**このクラウド環境はLinuxです。iPhone SE実機・iOS 18.3.1 Safariでの動作、実際の30分録画、数時間/数日の待機、長いMP4の書き出し、公開後の実端末試験は未検証です。** Chromiumの成功をSafariの成功とは扱いません。

## iOS Safariの制限の根拠

2026-11-09確認。MDN本文と互換性データの公式GitHub原文を参照（この環境ではMDN/WebKit本体への直接接続が制限されているため）。過去の特定端末での安定性を保証するデータではありません。

- [getUserMedia：HTTPS・許可・制約](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) / [確認した原文](https://github.com/mdn/content/blob/main/files/en-us/web/api/mediadevices/getusermedia/index.md)
- [MediaRecorder dataavailable：timesliceは正確ではなくSafariのカメラ停止で遅延しうる](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event) / [原文](https://github.com/mdn/content/blob/main/files/en-us/web/api/mediarecorder/dataavailable_event/index.md)
- [Screen Wake Lock：非アクティブ時の解除・OS設定による拒否](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) / [原文](https://github.com/mdn/content/blob/main/files/en-us/web/api/screen_wake_lock_api/index.md)
- [Wake Lock互換性データ](https://github.com/mdn/browser-compat-data/blob/main/api/WakeLock.json)：iOS Safari 16.4以降。18.4より前のホーム画面Webアプリには制限。Safariタブでも実行時の取得可否を確認する必要があります。
- [MediaRecorder互換性データ](https://github.com/mdn/browser-compat-data/blob/main/api/MediaRecorder.json)：iOS Safari 14以降。サポートは長時間録画の安定性を保証しません。
- [保存容量と削除条件](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) / [原文](https://github.com/mdn/content/blob/main/files/en-us/web/api/storage_api/storage_quotas_and_eviction_criteria/index.md)：best-effort・容量制限・永続化・Safariで利用されないサイトの削除。
- [File System Accessのディレクトリ選択はユーザー操作が必要](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) / [原文](https://github.com/mdn/content/blob/main/files/en-us/web/api/window/showdirectorypicker/index.md)。このアプリではSafariで汎用の自動ファイル保存を前提にせず、IndexedDBと操作によるダウンロード/共有を使います。

Service Worker、Push、ホーム画面追加でOSによるカメラのバックグラウンド制限を回避する実装はありません。
