#!/usr/bin/env bash
# Справжні завантаження в емуляторі + знімки екрана.
set -x
OUT=ci-out
mkdir -p $OUT
PKG=ua.itorrent.client
FILES=/sdcard/Android/data/$PKG/files
T1="https://archive.org/download/testmp3testfile/testmp3testfile_archive.torrent"
T2="magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A6969&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F"

adb install -r -g app/build/outputs/apk/debug/app-debug.apk > $OUT/install.txt 2>&1
adb shell appops set $PKG MANAGE_EXTERNAL_STORAGE allow
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS 2>/dev/null
adb shell cmd uimode night no
adb logcat -c
adb shell am start -n $PKG/.MainActivity --es autoAdd "$T1"
sleep 8
adb exec-out screencap -p > $OUT/1_start.png
adb shell am start -n $PKG/.MainActivity --es autoAdd "$T2"
sleep 20
adb exec-out screencap -p > $OUT/2_running.png
for i in $(seq 1 30); do
  sleep 6
  adb shell cat $FILES/state.json > $OUT/state.json 2>/dev/null
  if grep -q '"progress": 1' $OUT/state.json 2>/dev/null; then break; fi
done
adb exec-out screencap -p > $OUT/3_later.png
adb shell cat $FILES/state.json > $OUT/state.json
adb shell cat $FILES/log.txt > $OUT/applog.txt
adb shell ls -laR /sdcard/Download/Itorrent > $OUT/downloads.txt 2>&1
adb shell dumpsys notification --noredact | grep -A3 "ua.itorrent" | head -40 > $OUT/notification.txt
# Темна тема
adb shell cmd uimode night yes
sleep 4
adb exec-out screencap -p > $OUT/4_dark.png
adb shell cmd uimode night no
# Релізна збірка (з R8): запуск і завантаження
adb shell am force-stop $PKG
adb uninstall $PKG > /dev/null 2>&1
sleep 3
adb install -r -g app/build/outputs/apk/release/app-release.apk > $OUT/install_release.txt 2>&1
adb shell appops set $PKG MANAGE_EXTERNAL_STORAGE allow
adb shell am start -W -n $PKG/.MainActivity >> $OUT/install_release.txt 2>&1
sleep 8
adb shell am start -a android.intent.action.VIEW -d "$T2" -n $PKG/.MainActivity
sleep 12
adb exec-out screencap -p > $OUT/5_release.png
adb logcat -d > $OUT/logcat_all.txt 2>&1 || true
grep -iE "itorrent|libtorrent|AndroidRuntime|FATAL|chromium|has died|UnsatisfiedLink" $OUT/logcat_all.txt | grep -v AppsFilter | tail -400 > $OUT/logcat.txt || true
rm -f $OUT/logcat_all.txt
exit 0
