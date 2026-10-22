#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
branch='feature/adobe-legacy-release'
baseline='v0.0.0-snapshot-baseline'
[[ "$(git branch --show-current)" == "$branch" ]] || { printf 'Wrong release branch.\n' >&2; exit 1; }
[[ "$(git rev-parse "$baseline^{commit}")" == '2bdfa19e8821cda40965d00288643ce3a57061d8' ]] || { printf 'Baseline verification failed.\n' >&2; exit 1; }
for command in task npm java docker git; do
  command -v "$command" >/dev/null || { printf '%s is required.\n' "$command" >&2; exit 1; }
done
docker info >/dev/null
task frontend:check
task frontend:build:proprietary
./gradlew build -PbuildWithFrontend=true -x test
docker build -t stirling-pdf:custom -f docker/embedded/Dockerfile .
task frontend:typecheck:desktop
task desktop:build:dev:windows
git diff --check
git add -- frontend/src/editor/core/components/home/LegacyHome.tsx frontend/src/editor/core/components/home/LegacyHome.css \
  frontend/src/editor/core/hooks/useDesktopSelection.ts frontend/src/editor/core/hooks/useDesktopSelection.test.tsx \
  frontend/src/editor/core/styles/desktopSelection.css frontend/src/editor/core/pages/HomePage.tsx \
  frontend/src/editor/core/components/filesPage/FileGrid.tsx frontend/src/editor/core/components/shared/FileCard.tsx \
  frontend/src/editor/core/components/filesPage/FileGrid.accessibility.test.tsx \
  frontend/src/editor/core/components/filesPage/FileGrid.touch.test.tsx \
  frontend/src/editor/core/components/startup/StartupPrompts.test.tsx \
  frontend/src/editor/core/components/filesPage/LibraryFilePicker.test.tsx \
  frontend/src/editor/core/components/tools/toolPicker/ToolButton.tsx \
  frontend/src/editor/core/components/tools/toolPicker/ToolSearch.tsx \
  frontend/src/editor/core/components/tools/shared/SuggestedToolsSection.tsx \
  frontend/src/editor/core/components/tools/toolPicker/FavoriteStar.tsx \
  frontend/src/editor/core/components/tools/fullscreen/CompactToolItem.tsx \
  frontend/src/editor/core/components/tools/fullscreen/DetailedToolItem.tsx \
  frontend/src/editor/core/components/home/LegacyHome.test.tsx setup_and_snapshot.sh build_and_push.sh \
  .github/workflows/adobe-legacy-release.yml .github/workflows/adobe-legacy-desktop.yml
if ! git diff --cached --quiet; then
  git commit -m 'Feat: Implement desktop click semantics and Adobe legacy landing interface layout'
fi
git push origin "$branch" "refs/tags/$baseline"
