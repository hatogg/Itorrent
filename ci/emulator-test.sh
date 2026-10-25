#!/usr/bin/env bash
# Справжні завантаження в емуляторі + знімки екрана інтерфейсу.
set -x
OUT=ci-out
mkdir -p $OUT
PKG=ua.itorrent.client
ACT=$PKG/.MainActivity
FILES=/sdcard/Android/data/$PKG/files
# Торент-файл Ubuntu Server з HTTPS-трекером (назву поточного випуску беремо зі сторінки релізів)
UB=$(curl -sL https://releases.ubuntu.com/noble/ | grep -o 'ubuntu-24\.04[0-9.]*-live-server-amd64\.iso\.torrent' | head -1)
T1="https://releases.ubuntu.com/noble/${UB:-ubuntu-24.04.3-live-server-amd64.iso.torrent}"
echo "T1=$T1" > $OUT/sources.txt
T2="magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A6969&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F"
js() { adb shell am start -n $ACT --es js "'$1'" > /dev/null; sleep ${2:-2}; }
shot() { adb exec-out screencap -p > $OUT/$1.png; }

adb install -r -g app/build/outputs/apk/debug/app-debug.apk > $OUT/install.txt 2>&1
adb shell appops set $PKG MANAGE_EXTERNAL_STORAGE allow
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS 2>/dev/null
adb shell cmd uimode night no
adb logcat -c
adb shell am start -n $ACT --ez skipWelcome true --es autoAdd "$T1"
sleep 8
shot 01_start
adb shell am start -n $ACT --es autoAdd "'$T2'"
sleep 25
shot 02_list
js "document.querySelector(\"tbody tr\").click()" 3
shot 03_general
for t in 1 2 4 5; do
  js "document.querySelectorAll(\".ptab\")[$t].click()" 3
  shot 04_tab$t
done
js "document.querySelectorAll(\".ptab\")[0].click()" 1
for i in $(seq 1 25); do
  sleep 6
  adb shell cat $FILES/state.json > $OUT/state.json 2>/dev/null
  if grep -q '"progress": 1' $OUT/state.json 2>/dev/null; then break; fi
done
shot 05_later
# Створення торента з завантаженої папки і RSS-канал
js "Android.call(\"create\",JSON.stringify({opts:{path:\"/storage/emulated/0/Download/Itorrent/Sintel\",pieceSize:0,format:\"v1\",priv:false,seed:false,trackers:\"udp://tracker.opentrackr.org:1337/announce\",webSeeds:\"\",comment:\"CI\",outDir:\"/storage/emulated/0/Download\"}}))" 8
js "Android.call(\"rss.addFeed\",JSON.stringify({url:\"https://distrowatch.com/news/torrents.xml\",name:\"DistroWatch\"}))" 15
js "It.setTab(\"rss\")" 3
shot 05_rss
js "document.querySelectorAll(\".rss-feed\")[1].click();console.log(\"rss-state \"+JSON.stringify(Rss.state()))" 3
shot 05_rss_feed
js "document.querySelector(\".rss-art\")&&document.querySelector(\".rss-art\").click();console.log(\"rss-state2 \"+JSON.stringify(Rss.state()))" 5
shot 05_rss_article
js "It.setTab(\"transfers\")" 1
# Перегляд під час завантаження: локальний HTTP-сервер віддає діапазони байтів
SPORT=$(grep -o '"sport": [0-9]*' $OUT/state.json | grep -o '[0-9]*$')
SID=$(python3 -c "import json;d=json.load(open('$OUT/state.json'));print([t['id'] for t in d['t'] if t['name']=='Sintel'][0])" 2>/dev/null)
echo "port=$SPORT id=$SID" > $OUT/stream.txt
for idx in 0 1 2 3 4 5 6 7 8; do
  echo "== file $idx" >> $OUT/stream.txt
  adb shell "printf 'GET /$SID/$idx/f HTTP/1.1\r\nHost: x\r\nRange: bytes=0-15\r\n\r\n' | nc -w 5 127.0.0.1 $SPORT" 2>&1 | head -c 400 | od -c | head -20 >> $OUT/stream.txt
done
# меню торента і бічна панель
js "It.S.sel=new Set([It.S.rows[0].id]);It.S.focus=It.S.rows[0].id;document.querySelector(\"tbody tr\").dispatchEvent(new MouseEvent(\"contextmenu\",{bubbles:true,clientX:120,clientY:200}))" 2
shot 06_menu
js "U.closeMenu();document.querySelector(\".toolbar .tb\").click()" 2
shot 07_sidebar
js "document.querySelector(\".drawer-scrim\").click();Dialogs.addLinks()" 2
shot 08_links
js "U.stack.length&&U.stack[0].back();Options.open()" 2
shot 09_options
js "U.stack.length&&U.stack[0].back();It.setTab(\"log\")" 2
shot 10_log
js "It.setTab(\"transfers\")" 1
adb shell cat $FILES/state.json > $OUT/state.json
adb shell cat $FILES/log.txt > $OUT/applog.txt
adb shell ls -laR /sdcard/Download/Itorrent > $OUT/downloads.txt 2>&1
adb shell dumpsys notification --noredact | grep -B2 -A12 "pkg=ua.itorrent" | head -60 > $OUT/notification.txt
# Темна тема
adb shell cmd uimode night yes
sleep 4
shot 11_dark
sleep 6
shot 11_dark_b
adb shell cmd uimode night no
sleep 2
# Вихід через меню: стан зберігається, процес завершується; далі торенти мають відновитися
js "Android.call(\"exit\",\"{}\")" 1
for i in $(seq 1 20); do adb shell pidof $PKG > /dev/null || break; sleep 1; done
echo "after exit pid: $(adb shell pidof $PKG)" > $OUT/exit.txt
adb shell run-as $PKG ls -la files/torrents >> $OUT/exit.txt 2>&1
sleep 2
adb shell am start -n $ACT
sleep 12
shot 12_restored
adb shell cat $FILES/log.txt > $OUT/applog_restart.txt
# Релізна збірка (з R8): запуск і завантаження
adb shell am force-stop $PKG
adb uninstall $PKG > /dev/null 2>&1
sleep 3
adb install -r -g app/build/outputs/apk/release/app-release.apk > $OUT/install_release.txt 2>&1
adb shell appops set $PKG MANAGE_EXTERNAL_STORAGE allow
adb shell am start -W -n $ACT >> $OUT/install_release.txt 2>&1
sleep 6
shot 13_release_welcome
adb shell input keyevent 4
sleep 1
adb shell am start -a android.intent.action.VIEW -d "'$T2'" -n $ACT
sleep 10
shot 14_release_add
adb logcat -d > $OUT/logcat_all.txt 2>&1 || true
grep -iE "itorrent|libtorrent|AndroidRuntime|FATAL|chromium|has died|UnsatisfiedLink|DEBUG   :|ItorrentJS" $OUT/logcat_all.txt | grep -v AppsFilter | tail -500 > $OUT/logcat.txt || true
rm -f $OUT/logcat_all.txt
exit 0
