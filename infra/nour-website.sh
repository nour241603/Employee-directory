#!/usr/bin/env bash
# OWNER: Nour — the frontend as a static website on Amazon S3.
# Writes the API address into frontend/js/config.js, then uploads the frontend folder.
#
#   bash $INFRA/nour-website.sh
source "$(dirname "$0")/_lib.sh"
check_floci
require_api

say "Nour 1/2  Point the website at the API"
# Replace only the FLOCI_API line (the same one line Lab 7 asks you to change).
sed -i.bak "s|^const FLOCI_API = .*|const FLOCI_API = '${API_URL}';|" frontend/js/config.js
rm -f frontend/js/config.js.bak
grep "^const FLOCI_API" frontend/js/config.js
ok "config.js uses $API_URL"

say "Nour 2/2  S3: bucket $BUCKET"
aws s3 mb "s3://$BUCKET" >/dev/null 2>&1 && ok "bucket $BUCKET created" || skip "bucket $BUCKET already exists"

aws s3 sync frontend "s3://$BUCKET" --delete --exclude "*.bak" --exclude ".gitkeep" >/dev/null
# Make sure the browser gets the right file types (some Windows PCs guess wrongly).
aws s3 cp frontend/css "s3://$BUCKET/css" --recursive --content-type text/css >/dev/null
aws s3 cp frontend/js  "s3://$BUCKET/js"  --recursive --content-type text/javascript >/dev/null
for page in frontend/*.html; do
  aws s3 cp "$page" "s3://$BUCKET/$(basename "$page")" --content-type text/html >/dev/null
done
aws s3 ls "s3://$BUCKET" --recursive
ok "website uploaded"

echo
echo "   Open: ${WEBSITE_ORIGIN}/${BUCKET}/index.html   (type localhost, not 127.0.0.1)"
