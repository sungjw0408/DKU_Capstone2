export function gmailComposeUrl(address, title, body = "") {
  const subject = title.replace(/[\r\n]+/g, " ").trim();
  return "https://mail.google.com/mail/?view=cm&fs=1"
    + "&to=" + encodeURIComponent(address)
    + "&su=" + encodeURIComponent(subject)
    + (body ? "&body=" + encodeURIComponent(body) : "");
}

export async function signedInWithGoogle(user) {
  if (!user || user.isAnonymous) return false;
  const token = await user.getIdTokenResult();
  return token.signInProvider === "google.com";
}
