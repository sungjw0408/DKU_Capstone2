const CLIENT_ID = /^[\w-]+\.apps\.googleusercontent\.com$/;
const APP_IDENTIFIER = /^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/;

// Firebase의 기존 Google 제공업체에서 확인한 공개 웹 클라이언트 ID.
const DEFAULT_WEB_CLIENT_ID = "835397104507-b6r56lfq382c3dbihjt5r31o5pehil79.apps.googleusercontent.com";
const DEFAULT_APP_IDENTIFIER = "com.actiondoc.ttokdoc";

function buildAppConfig(base, env = process.env) {
  const webClientId = (env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || DEFAULT_WEB_CLIENT_ID).trim();
  const iosClientId = (env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "").trim();
  const plugins = [...(base.plugins || []), "expo-dev-client"];
  if (CLIENT_ID.test(iosClientId)) {
    plugins.push(["@react-native-google-signin/google-signin", {
      iosUrlScheme: `com.googleusercontent.apps.${iosClientId.split(".apps.googleusercontent.com")[0]}`,
    }]);
  }
  // Firebase JS SDK를 유지한다. 네이티브 Firebase SDK/서비스 계정 파일은 필요하지 않다.
  return {
    ...base,
    scheme: base.scheme || "ttokdoc",
    ios: { ...base.ios, bundleIdentifier: env.TTOKDOC_IOS_BUNDLE_IDENTIFIER || DEFAULT_APP_IDENTIFIER },
    android: { ...base.android, package: env.TTOKDOC_ANDROID_PACKAGE || DEFAULT_APP_IDENTIFIER },
    plugins,
    extra: { ...base.extra, googleSignIn: { webClientId, iosClientId } },
  };
}

function configurationErrors(config, platform) {
  const errors = [];
  if (!["android", "ios"].includes(platform)) return ["플랫폼은 android 또는 ios로 지정해 주세요."];
  if (!CLIENT_ID.test(config.extra.googleSignIn.webClientId)) errors.push("Google 웹 OAuth 클라이언트 ID를 확인해 주세요.");
  const identifier = platform === "ios" ? config.ios.bundleIdentifier : config.android.package;
  if (!APP_IDENTIFIER.test(identifier)) errors.push("Firebase에 등록한 앱 식별자를 확인해 주세요.");
  if (platform === "ios" && !CLIENT_ID.test(config.extra.googleSignIn.iosClientId)) {
    errors.push("Firebase에 iOS 앱을 등록하고 .env의 EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID를 입력해 주세요.");
  }
  return errors;
}

module.exports = { buildAppConfig, configurationErrors };
