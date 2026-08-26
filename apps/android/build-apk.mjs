/**
 * Builds the Android APK.
 *
 * Exists mostly to find the right JDK. Gradle refuses to start on a JVM newer
 * than it understands — on this machine the system Java is 25 and Gradle 8.14
 * stops at 24, with the memorable message "Unsupported class file major version
 * 69". Android Studio's own bundled JDK is 25 too, so it is no help: that one
 * runs the IDE, not Gradle.
 *
 * So: prefer JAVA_HOME if it already points at something usable, otherwise look
 * for an installed JDK in the supported range and use that just for this build.
 * The system default is left alone.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  copyFileSync,
  mkdirSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Read from the workspace rather than written here twice.
 *
 * The APK used to ship as `Capitales-debug.apk`, which said how it was built
 * and not what it was — every other artifact carries its version in its name,
 * and this one could not be told apart from the one before it.
 */
const VERSION = JSON.parse(
  readFileSync(path.join(HERE, 'package.json'), 'utf8'),
).version;
const PROJECT = path.join(HERE, 'android');

/** Gradle 8.14 supports up to Java 24; 17 is the floor for the Android plugin. */
const MIN_JAVA = 17;
const MAX_JAVA = 24;

const JDK_ROOTS = [
  'C:\\Program Files\\Eclipse Adoptium',
  'C:\\Program Files\\Java',
  'C:\\Program Files\\Microsoft',
  '/usr/lib/jvm',
];

function javaMajor(home) {
  const bin = path.join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!existsSync(bin)) return null;
  const out = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  const text = `${out.stdout ?? ''}${out.stderr ?? ''}`;
  const m = text.match(/version "(\d+)/);
  return m ? Number(m[1]) : null;
}

function findJdk() {
  const fromEnv = process.env['JAVA_HOME'];
  if (fromEnv) {
    const v = javaMajor(fromEnv);
    if (v && v >= MIN_JAVA && v <= MAX_JAVA) return { home: fromEnv, version: v };
  }
  for (const root of JDK_ROOTS) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      const home = path.join(root, entry);
      const v = javaMajor(home);
      if (v && v >= MIN_JAVA && v <= MAX_JAVA) return { home, version: v };
    }
  }
  return null;
}

const jdk = findJdk();
if (!jdk) {
  console.error(
    `No JDK between ${MIN_JAVA} and ${MAX_JAVA} found, and Gradle cannot run on ` +
      `anything newer.\n\n  winget install EclipseAdoptium.Temurin.21.JDK\n`,
  );
  process.exit(1);
}
console.log(`using JDK ${jdk.version} at ${jdk.home}`);

const sdk =
  process.env['ANDROID_HOME'] ??
  (existsSync('C:\\Android\\Sdk') ? 'C:\\Android\\Sdk' : undefined);
if (!sdk) {
  console.error('ANDROID_HOME is not set and no SDK found at C:\\Android\\Sdk');
  process.exit(1);
}

const release = process.argv.includes('--release');
const task = release ? 'assembleRelease' : 'assembleDebug';

// Absolute path on purpose: with shell:true, Windows resolves a bare
// "gradlew.bat" against PATH rather than cwd, and reports the unhelpful
// "operable program or batch file".
const gradlew = path.join(
  PROJECT,
  process.platform === 'win32' ? 'gradlew.bat' : 'gradlew',
);
const isWindows = process.platform === 'win32';
const options = {
  cwd: PROJECT,
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME: jdk.home, ANDROID_HOME: sdk },
};

/*
 * Windows needs a shell to run a .bat at all, but a shell splits the path on
 * its spaces — "C:\Users\Philippe Noth\..." becomes two arguments. Passing one
 * fully-quoted command string solves both, and avoids Node's warning about
 * mixing an args array with shell:true. Everywhere else, no shell is needed.
 */
const result = isWindows
  ? spawnSync(`"${gradlew}" ${task} --no-daemon`, { ...options, shell: true })
  : spawnSync(gradlew, [task, '--no-daemon'], options);

if (result.status !== 0) process.exit(result.status ?? 1);

// Lift the APK out of Gradle's output tree under a name worth sending someone.
const built = path.join(
  PROJECT,
  'app', 'build', 'outputs', 'apk',
  release ? 'release' : 'debug',
  release ? 'app-release-unsigned.apk' : 'app-debug.apk',
);
if (existsSync(built)) {
  const outDir = path.join(HERE, 'release');
  mkdirSync(outDir, { recursive: true });
  const suffix = release ? '-unsigned' : '';
  const dest = path.join(outDir, `Capitales-${VERSION}${suffix}.apk`);
  copyFileSync(built, dest);
  console.log(`\nAPK -> ${path.relative(process.cwd(), dest)}`);
}
