#!/usr/bin/env bash
# OWNER: Nour — the frontend as a static website on Amazon S3.
# Copies the frontend, writes the API address into the copy's config.js, then uploads the copy.
#
#   bash $INFRA/website.sh
source "$(dirname "$0")/_lib.sh"
check_floci
require_api

say "Website 1/2  Point the website at the API"
# Work on a copy, so frontend/js/config.js in Git never changes (nothing to commit by mistake).
BUILD="$INFRA/.site-build"
rm -rf "$BUILD"
cp -r frontend "$BUILD"
# The API path is relative to the website address, so the same files work on
# http://localhost:4566 and through a public tunnel (https://...trycloudflare.com).
sed -i "s|^const FLOCI_API = .*|const FLOCI_API = '${API_PATH}';|" "$BUILD/js/config.js"
grep "^const FLOCI_API" "$BUILD/js/config.js"
ok "website copy uses the API at ${API_PATH}"

say "Website 2/2  S3: bucket $BUCKET"
aws s3 mb "s3://$BUCKET" >/dev/null 2>&1 && ok "bucket $BUCKET created" || skip "bucket $BUCKET already exists"

aws s3 sync "$BUILD" "s3://$BUCKET" --delete --exclude "*.bak" --exclude ".gitkeep" >/dev/null
# Make sure the browser gets the right file types (some Windows PCs guess wrongly).
aws s3 cp "$BUILD/css" "s3://$BUCKET/css" --recursive --content-type text/css >/dev/null
aws s3 cp "$BUILD/js"  "s3://$BUCKET/js"  --recursive --content-type text/javascript >/dev/null
for page in "$BUILD"/*.html; do
  aws s3 cp "$page" "s3://$BUCKET/$(basename "$page")" --content-type text/html >/dev/null
done
aws s3 ls "s3://$BUCKET" --recursive
ok "website uploaded"

echo
echo "   Open: ${WEBSITE_ORIGIN}/${BUCKET}/index.html   (type localhost, not 127.0.0.1)"
