#!/bin/sh
set -eu

T=/etc/asterisk/templates
mkdir -p /etc/asterisk /etc/asterisk/generated

for f in pjsip.conf extensions.conf ari.conf http.conf rtp.conf manager.conf queues.conf voicemail.conf confbridge.conf modules.conf logger.conf; do
  if [ -f "$T/$f" ]; then
    envsubst < "$T/$f" > "/etc/asterisk/$f"
  fi
done

# Optional generated extensions are persisted by the API.
touch /etc/asterisk/generated/pjsip_extensions.conf
if ! grep -q '^#include generated/pjsip_extensions.conf' /etc/asterisk/pjsip.conf; then
  printf '\n#include generated/pjsip_extensions.conf\n' >> /etc/asterisk/pjsip.conf
fi

exec /usr/sbin/asterisk -f -U asterisk -G asterisk -vvv
