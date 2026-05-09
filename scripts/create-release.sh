#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  CI_API_V4_URL
  CI_COMMIT_TAG
  CI_JOB_TOKEN
  CI_PROJECT_ID
  CI_PROJECT_NAME
  CI_PROJECT_URL
)

for var_name in "${required_vars[@]}"; do
  if [ -z "${!var_name:-}" ]; then
    echo "Missing required environment variable: $var_name" >&2
    exit 1
  fi
done

release_name="${RELEASE_NAME:-$CI_PROJECT_NAME $CI_COMMIT_TAG}"
release_description="${RELEASE_DESCRIPTION:-Release $CI_COMMIT_TAG}"
asset_name="${RELEASE_ASSET_NAME:-Built packages}"
asset_url="${RELEASE_ASSET_URL:-$CI_PROJECT_URL/-/jobs/artifacts/$CI_COMMIT_TAG/browse/dist?job=package}"
release_api_url="$CI_API_V4_URL/projects/$CI_PROJECT_ID/releases"
release_links_api_url="$release_api_url/$CI_COMMIT_TAG/assets/links"

common_args=(
  --silent
  --show-error
  --header "JOB-TOKEN: $CI_JOB_TOKEN"
  --data-urlencode "name=$release_name"
  --data-urlencode "tag_name=$CI_COMMIT_TAG"
  --data-urlencode "description=$release_description"
)

create_status="$(curl --output /tmp/release-response.json --write-out "%{http_code}" \
  --request POST "${common_args[@]}" "$release_api_url")"

if [ "$create_status" = "201" ]; then
  echo "Release created for $CI_COMMIT_TAG"
elif [ "$create_status" = "409" ]; then
  update_status="$(curl --output /tmp/release-response.json --write-out "%{http_code}" \
    --request PUT "${common_args[@]}" "$release_api_url/$CI_COMMIT_TAG")"
  if [ "$update_status" != "200" ]; then
    echo "Release update failed with HTTP $update_status" >&2
    cat /tmp/release-response.json >&2
    exit 1
  fi
  echo "Release updated for $CI_COMMIT_TAG"
else
  echo "Release creation failed with HTTP $create_status" >&2
  cat /tmp/release-response.json >&2
  exit 1
fi

link_list_status="$(curl --silent --show-error --output /tmp/release-links.json --write-out "%{http_code}" \
  --header "JOB-TOKEN: $CI_JOB_TOKEN" \
  "$release_links_api_url")"

if [ "$link_list_status" != "200" ]; then
  echo "Fetching release links failed with HTTP $link_list_status" >&2
  cat /tmp/release-links.json >&2
  exit 1
fi

existing_link_id="$(RELEASE_ASSET_NAME="$asset_name" ruby -rjson -e '
  links = JSON.parse(File.read("/tmp/release-links.json"))
  match = links.find { |link| link["name"] == ENV.fetch("RELEASE_ASSET_NAME") }
  puts(match ? match["id"] : "")
')"

link_common_args=(
  --silent
  --show-error
  --header "JOB-TOKEN: $CI_JOB_TOKEN"
  --data-urlencode "name=$asset_name"
  --data-urlencode "url=$asset_url"
  --data-urlencode "link_type=package"
)

if [ -n "$existing_link_id" ]; then
  link_status="$(curl --output /tmp/release-link-response.json --write-out "%{http_code}" \
    --request PUT "${link_common_args[@]}" "$release_links_api_url/$existing_link_id")"
  if [ "$link_status" != "200" ]; then
    echo "Release link update failed with HTTP $link_status" >&2
    cat /tmp/release-link-response.json >&2
    exit 1
  fi
  echo "Release link updated for $asset_name"
else
  link_status="$(curl --output /tmp/release-link-response.json --write-out "%{http_code}" \
    --request POST "${link_common_args[@]}" "$release_links_api_url")"
  if [ "$link_status" != "201" ]; then
    echo "Release link creation failed with HTTP $link_status" >&2
    cat /tmp/release-link-response.json >&2
    exit 1
  fi
  echo "Release link created for $asset_name"
fi
