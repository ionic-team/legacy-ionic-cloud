#/bin/sh

if [ -z $1 ]; then
  cat <<-EOF
		Please supply the destination project path
		Ex:
		  npm run watch -- ~/ionic/ionic-conference-app
		or
		  ./scripts/watch.sh ~/ionic/ionic-conference-app
	EOF
  exit 1
fi

if [ ! -d $1 ]; then
  echo "The supplied project path doesn't exist."
  exit 1
fi

IONIC_CONFIG="${1%/}/ionic.config.json"
if [ ! -f $IONIC_CONFIG ]; then
  echo "Are you sure this is an ionic project? $IONIC_CONFIG doesn't exist."
  exit 1
fi

CLOUD_DIR="${1%/}/node_modules/@ionic/cloud/"
NPM_BIN=$(npm bin)

# tidy up
[ -d $CLOUD_DIR ] && rm -r $CLOUD_DIR
mkdir -p $CLOUD_DIR
cp package.json $CLOUD_DIR || exit 1
rm -r dist/* 2>/dev/null

# watch for file changes, copy to dest node_modules/@ionic/cloud/
$NPM_BIN/chokidar "dist/**/*" --silent --t=-1 --d=-1 -c "rsync --relative {path} $CLOUD_DIR" &

# let watchers init before transpiling
# if you're missing files in node_modules, up this number
sleep 2 && ($NPM_BIN/tsc -w -p tsconfig-esm.json &)
$NPM_BIN/tsc -w -p tsconfig-es5.json && fg
