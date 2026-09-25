#!/bin/sh
set -eu

T=/etc/asterisk/templates
mkdir -p /etc/asterisk /etc/asterisk/generated

# Only substitute known environment variables. This preserves Asterisk
# dialplan variables such as ${CALLERID(num)}, ${EXTEN}, ${UNIQUEID}, etc.
VARS='$VONO_HOST $VONO_PORT $VONO_USERNAME $VONO_AUTH_USERNAME $VONO_PASSWORD $VONO_FROM_USER $VONO_FROM_DOMAIN $VONO_CODECS $VONO_DTMF_MODE $VONO_MEDIA_ENCRYPTION $RTP_START $RTP_END $RECORD_CALLS $ARI_PASSWORD $AMI_PASSWORD'

for f in pjsip.conf extensions.conf ari.conf http.conf rtp.conf manager.conf queues.conf voicemail.conf confbridge.conf modules.conf logger.conf cdr.conf cdr_manager.conf; do
  if [ -f "$T/$f" ]; then
    envsubst "$VARS" < "$T/$f" > "/etc/asterisk/$f"
  fi
done

touch /etc/asterisk/generated/pjsip_extensions.conf
if ! grep -q '^#include generated/pjsip_extensions.conf' /etc/asterisk/pjsip.conf; then
  printf '\n#include generated/pjsip_extensions.conf\n' >> /etc/asterisk/pjsip.conf
fi

chown -R asterisk:asterisk /etc/asterisk/generated /var/spool/asterisk /var/log/asterisk
exec /usr/sbin/asterisk -f -U asterisk -G asterisk -vvv
