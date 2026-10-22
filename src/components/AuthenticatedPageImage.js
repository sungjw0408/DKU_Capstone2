import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { getPageImage } from "../services/api";
import { colors, type } from "../theme/theme";

export default function AuthenticatedPageImage({ documentId, page, width, style, ...props }) {
  const [image, setImage] = useState({ uri: null, error: "" });
  useEffect(() => {
    let active = true;
    setImage({ uri: null, error: "" });
    getPageImage(documentId, page, width)
      .then((uri) => { if (active) setImage({ uri, error: "" }); })
      .catch((failure) => { if (active) setImage({ uri: null, error: failure.message }); });
    return () => { active = false; };
  }, [documentId, page, width]);
  if (image.uri) return <Image {...props} source={{ uri: image.uri }} style={style} />;
  return <View style={[style, { alignItems: "center", justifyContent: "center" }]}>
    {image.error ? <Text accessibilityRole="alert" style={[type.small, { color: colors.alert }]}>{image.error}</Text>
      : <ActivityIndicator color={colors.stamp} />}
  </View>;
}
