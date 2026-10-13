import { useEffect, useState } from "react";
import { Button, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetch as expoFetch } from "expo/fetch";

const baseUrl = process.env.EXPO_PUBLIC_ECHO_URL ?? "http://127.0.0.1:8787";
const payload = "test payload";
const expoVersion = require("expo/package.json").version;

export default function App() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const globalIsExpo = globalThis.fetch === expoFetch;

  async function run() {
    setRunning(true);
    setResults([]);
    setError("");
    const collected = [];
    try {
      const implementations = [
        { name: "expo/fetch", request: expoFetch },
        { name: globalIsExpo ? "global-expo" : "global-rn", request: globalThis.fetch },
      ];
      await expoFetch(`${baseUrl}/metadata?test=runtime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: Platform.OS,
          osVersion: Platform.Version,
          rnVersion: Platform.constants.reactNativeVersion,
          expoVersion,
          useRnFetch: process.env.EXPO_PUBLIC_USE_RN_FETCH,
          globalIsExpo,
        }),
      });
      const tests = [
        {
          name: "blob-mismatched-type",
          contentType: "application/octet-stream",
          body: () => new Blob([payload], { type: "text/plain" }),
        },
        {
          name: "blob-empty-type",
          contentType: "image/jpeg",
          body: () => new Blob([payload], { type: "" }),
        },
        {
          name: "blob-matching-type",
          contentType: "text/plain",
          body: () => new Blob([payload], { type: "text/plain" }),
        },
        {
          name: "arraybuffer-control",
          contentType: "image/jpeg",
          body: () => Uint8Array.from([...payload], (char) => char.charCodeAt(0)).buffer,
        },
        {
          name: "response-blob-without-content-type",
          contentType: "image/jpeg",
          body: async () => {
            const response = await expoFetch(`${baseUrl}/payload-without-type`);
            if (!response.ok) throw new Error(`Payload HTTP ${response.status}`);
            return response.blob();
          },
        },
      ];
      for (const implementation of implementations) {
        for (const test of tests) {
          const body = await test.body();
          const url = `${baseUrl}/echo?${new URLSearchParams({
            implementation: implementation.name,
            test: test.name,
            expected: test.contentType,
          })}`;
          const response = await implementation.request(url, {
            method: "PUT",
            headers: new Headers({ "Content-Type": test.contentType }),
            body,
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new Error(`Echo HTTP ${response.status}`);
          const result = await response.json();
          collected.push({
            ...result,
            blobType: typeof body.type === "string" ? body.type : null,
            passed: result.receivedContentType === test.contentType && result.bodyText === payload,
          });
          console.log("FETCH_REPRO", JSON.stringify(collected[collected.length - 1]));
          setResults([...collected]);
        }
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error("FETCH_REPRO_ERROR", message);
      setError(message);
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => { run(); }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Fetch Content-Type Repro</Text>
      <Text>Expo {expoVersion} · {Platform.OS} · {String(Platform.Version)}</Text>
      <Text>Global Fetch: {globalIsExpo ? "Expo" : "React Native"}</Text>
      <Text>RN opt-out: {process.env.EXPO_PUBLIC_USE_RN_FETCH ?? "unset"}</Text>
      <Button title={running ? "Running…" : "Run again"} onPress={run} disabled={running} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {results.map((result) => (
        <View key={`${result.implementation}-${result.test}`} style={styles.result}>
          <Text style={styles.label}>{result.passed ? "PASS" : "FAIL"} · {result.implementation}</Text>
          <Text>{result.test}</Text>
          <Text>Blob type: {JSON.stringify(result.blobType)}</Text>
          <Text>Explicit: {result.expectedContentType}</Text>
          <Text>Received: {JSON.stringify(result.receivedContentType)}</Text>
          <Text>Bytes: {result.bodyBytes}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 70, paddingBottom: 50, gap: 12 },
  title: { fontSize: 24, fontWeight: "700" },
  result: { padding: 12, borderWidth: 1, borderColor: "#aaa", borderRadius: 8, gap: 4 },
  label: { fontWeight: "700" },
  error: { color: "#b00020" },
});
