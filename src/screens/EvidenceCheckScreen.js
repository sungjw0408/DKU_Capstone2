// 담당자 3 (원문 근거 확인 / 검증 흐름) 소유
// 근거 검증 에이전트 결과를 원문 페이지 위에 형광펜으로 표시하고, '확인 필요' 항목을 사용자가 승인하거나 삭제한다.
// - 텍스트 레이어가 있는 PDF: 백엔드가 렌더링한 실제 페이지 이미지 + 근거 위치 박스
// - 그 외(텍스트 입력, 이미지, 스캔 PDF, 원본 없음): 원문 텍스트를 종이 모양으로 그리고 근거 문장에 형광펜
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import PrimaryButton from "../components/PrimaryButton";
import AuthenticatedPageImage from "../components/AuthenticatedPageImage";
import { colors, spacing, radius } from "../theme/theme";
import { analysisDetail as mockDetail, evidenceSource as mockSource } from "../data/mockData";
import { confirmField, rejectField, getSource } from "../services/api";
import { backOrHome } from "../navigation/routes";

// ─────────────────────────── 화면 상수 ───────────────────────────
const UI = {
  soft: "#F1F4F9", // 요약 카드 · 페이지 번호 · 안내 띠 배경
  viewerBg: "#F3F5F8", // 페이지 뷰어 바탕
  hl: "rgba(255, 214, 10, 0.42)", // 선택한 항목 형광펜
  hlDim: "rgba(255, 226, 110, 0.22)", // '전체' 탭에서 나머지 항목
  arrow: "rgba(55, 60, 70, 0.55)",
};
const VIEWER_HEIGHT = 340;
const ZOOMS = [1, 1.5, 2, 2.5];
const THUMB_W = 52;
const THUMB_H = 72;

// 탭 순서 (시안: 전체 · 신청 기간 · 제출 서류 · 신청 대상 …)
const GROUPS = [
  { key: "period", title: "신청 기간", keys: ["application_start", "deadline"] },
  { key: "documents", title: "제출 서류", keys: ["required_document"] },
  { key: "criteria", title: "신청 대상", keys: ["applicant_criteria"] },
  { key: "method", title: "제출 방법", keys: ["submission_method"] },
  { key: "announcement", title: "결과 발표", keys: ["announcement_date"] },
  { key: "event", title: "행사 일정", keys: ["event_date"] },
  { key: "benefit", title: "지원 내용", keys: ["benefit"] },
  { key: "todo", title: "할 일", keys: ["todo"] },
  { key: "contact", title: "문의처", keys: ["contact"] },
];

const NEEDS_ACTION = (s) => s === "needs_review" || s === "unverified";

function showError(message) {
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert("처리하지 못했어요", message);
}

function confidenceTone(item) {
  if (item.status === "unverified") return { fg: colors.alert, label: "근거 없음" };
  if (item.confidence >= 90) return { fg: colors.green, label: `신뢰도 ${item.confidence}%` };
  if (item.confidence >= 80) return { fg: colors.stamp, label: `신뢰도 ${item.confidence}%` };
  return { fg: "#C2410C", label: `확인 필요 ${item.confidence}%` };
}

// ─────────────────────────── 데이터 가공 ───────────────────────────
// 분석 결과 필드 → 화면 항목. '신청 기간'은 시작일 + 마감일을 한 항목으로 묶는다.
function buildItems(fields, view) {
  const textById = {};
  (view?.sections ?? []).forEach((sec) => sec.items.forEach((it) => it.fieldId && (textById[it.fieldId] = it.text)));
  const periodText = view?.sections?.find((s) => s.key === "period")?.items?.[0]?.text;

  const byGroup = {};
  GROUPS.forEach((g) => {
    const fs = fields.filter((f) => g.keys.includes(f.key));
    if (!fs.length) return;
    const items = [];
    if (g.key === "period") {
      const start = fs.find((f) => f.key === "application_start");
      const end = fs.find((f) => f.key === "deadline");
      const pair = [start, end].filter(Boolean);
      const single = pair.length === 1 ? pair[0] : null;
      items.push({
        id: pair.map((f) => f.id).join("+"),
        group: g.key,
        title: single && single.key === "deadline" ? "신청 마감" : single ? "신청 시작" : g.title,
        value:
          (pair.length === 2 && periodText) ||
          pair.map((f) => textById[f.id] ?? f.value).join(" ~ "),
        fields: pair,
      });
      fs.filter((f) => !pair.includes(f)).forEach((f) =>
        items.push({ id: f.id, group: g.key, title: f.label, value: textById[f.id] ?? f.value, fields: [f] })
      );
    } else {
      fs.forEach((f) =>
        items.push({ id: f.id, group: g.key, title: g.title, value: textById[f.id] ?? f.value, fields: [f] })
      );
    }
    items.forEach((it) => {
      it.confidence = Math.min(...it.fields.map((f) => f.confidence));
      const weakest = it.fields.find((f) => f.status === "unverified") ?? it.fields.find((f) => f.status === "needs_review");
      it.status = weakest?.status ?? it.fields[0].status;
    });
    byGroup[g.key] = items;
  });
  return byGroup;
}

// 목업(백엔드 없이 실행): mockData.evidenceSource 에서 근거 위치를 계산
function mockAnalysis() {
  const full = mockSource.pages.join("\n\n");
  return {
    fields: mockSource.fields.map((f) => {
      const start = full.indexOf(f.quote);
      return {
        ...f,
        checks: [],
        evidence: {
          quote: f.quote,
          matched_text: start >= 0 ? f.quote : null,
          page: f.page,
          char_start: start >= 0 ? start : null,
          char_end: start >= 0 ? start + f.quote.length : null,
        },
      };
    }),
  };
}

// 전체 원문 기준 오프셋 → 페이지별 하이라이트 구간
function textRanges(fields, pages) {
  const starts = [];
  let off = 0;
  pages.forEach((p) => {
    starts.push(off);
    off += p.length + 2; // 백엔드 full_text 의 "\n\n" 구분자
  });
  const out = {};
  fields.forEach((f) => {
    const { char_start: s, char_end: e } = f.evidence ?? {};
    if (s == null || e == null) return;
    const pi = starts.findIndex((st, i) => s >= st && s < st + pages[i].length + 2);
    if (pi < 0) return;
    out[f.id] = { page: pi + 1, start: s - starts[pi], end: e - starts[pi] };
  });
  return out;
}

// ─────────────────────────── 페이지 그리기 ───────────────────────────
// 텍스트 페이지: 줄 단위로 나누고, 하이라이트 구간과 겹치는 부분만 배경색을 칠한다.
function TextPage({ text, ranges, focusIds, showAll, scale = 1, onLineLayout, tiny }) {
  const lines = [];
  let pos = 0;
  text.split("\n").forEach((line) => {
    lines.push({ text: line, start: pos, end: pos + line.length });
    pos += line.length + 1;
  });
  const visible = ranges.filter((r) => showAll || focusIds.includes(r.id));

  const fs = tiny ? 3.4 : 13 * scale;
  const lh = tiny ? 4.8 : 22 * scale;
  return (
    <View>
      {lines.map((ln, i) => {
        if (!ln.text.trim()) return <View key={i} style={{ height: lh * 0.5 }} />;
        const cuts = new Set([ln.start, ln.end]);
        visible.forEach((r) => {
          if (r.start > ln.start && r.start < ln.end) cuts.add(r.start);
          if (r.end > ln.start && r.end < ln.end) cuts.add(r.end);
        });
        const pts = [...cuts].sort((a, b) => a - b);
        const heading = /^\s*(\d+\.|[0-9]+\)|[가-힣]\.|제\s*\d+\s*조)/.test(ln.text) || i === 0;
        return (
          <Text
            key={i}
            onLayout={onLineLayout ? (e) => onLineLayout(ln.start, ln.end, e.nativeEvent.layout.y) : undefined}
            style={[
              styles.pageText,
              { fontSize: fs, lineHeight: lh, marginBottom: tiny ? 0.6 : 4 * scale },
              heading && styles.pageHeading,
            ]}
          >
            {pts.slice(0, -1).map((a, k) => {
              const b = pts[k + 1];
              const hit = visible.find((r) => r.start < b && r.end > a);
              const bg = hit ? (focusIds.includes(hit.id) ? UI.hl : UI.hlDim) : undefined;
              return (
                <Text key={k} style={bg ? { backgroundColor: bg } : null}>
                  {text.slice(a, b)}
                </Text>
              );
            })}
          </Text>
        );
      })}
    </View>
  );
}

// 이미지 페이지 위 하이라이트 박스
function Boxes({ boxes, focusIds, showAll, width, height }) {
  return boxes
    .filter((b) => showAll || focusIds.includes(b.id))
    .map((b, i) => (
      <View
        key={`${b.id}-${i}`}
        pointerEvents="none"
        style={{
          position: "absolute",
          left: b.rect[0] * width,
          top: b.rect[1] * height,
          width: b.rect[2] * width,
          height: b.rect[3] * height,
          backgroundColor: focusIds.includes(b.id) ? UI.hl : UI.hlDim,
          borderRadius: 2,
        }}
      />
    ));
}

// ─────────────────────────── 화면 ───────────────────────────
export default function EvidenceCheckScreen({ navigation, route }) {
  const params = route.params ?? {};
  const documentId = params.documentId;
  const isMock = !documentId;

  const [view, setView] = useState(params.view ?? mockDetail);
  const [analysis, setAnalysis] = useState(params.analysis ?? (isMock ? mockAnalysis() : { fields: [] }));
  const [source, setSource] = useState(isMock ? { kind: "text", pages: mockSource.pages, highlights: {} } : null);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState("all");
  const [itemIdx, setItemIdx] = useState(0);
  const [page, setPage] = useState(1);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [areaW, setAreaW] = useState(0);

  const vScroll = useRef(null);
  const hScroll = useRef(null);
  const lineYs = useRef({});

  // 원문 불러오기
  useEffect(() => {
    if (isMock) return;
    let alive = true;
    getSource(documentId)
      .then((s) => alive && setSource(s))
      .catch((e) => {
        if (!alive) return;
        setLoadError(e.message);
        // 원문을 못 불러오면 분석 결과의 근거 문장만이라도 보여준다
        const excerpt = view?.evidence?.sourceExcerpt;
        if (excerpt) setSource({ kind: "text", pages: [excerpt], highlights: {}, excerptOnly: true });
      });
    return () => {
      alive = false;
    };
  }, [documentId]);

  const imageMode = !!source?.pageImages?.length;
  const pageCount = imageMode ? source.pageImages.length : source?.pages?.length ?? 0;
  useEffect(() => setZoomIdx(imageMode ? 1 : 0), [imageMode]);

  const fields = analysis?.fields ?? [];
  const byGroup = useMemo(() => buildItems(fields, view), [fields, view]);
  const tabs = [{ key: "all", title: "전체" }, ...GROUPS.filter((g) => byGroup[g.key])];
  const items = tab === "all" ? GROUPS.flatMap((g) => byGroup[g.key] ?? []) : byGroup[tab] ?? [];
  const item = items[Math.min(itemIdx, Math.max(items.length - 1, 0))];
  const focusIds = item ? item.fields.map((f) => f.id) : [];

  // 페이지별 하이라이트
  const ranges = useMemo(
    () => (source && !imageMode ? textRanges(source.excerptOnly ? [] : fields, source.pages) : {}),
    [source, fields, imageMode]
  );
  const shownIds = tab === "all" ? fields.map((f) => f.id) : items.flatMap((it) => it.fields.map((f) => f.id));
  const locate = (fid) => (imageMode ? source?.highlights?.[fid] : ranges[fid]);
  const pageOf = (fid) => locate(fid)?.page ?? fields.find((f) => f.id === fid)?.evidence?.page ?? null;

  const boxesOn = (p) =>
    shownIds.flatMap((id) => {
      const h = source?.highlights?.[id];
      return h && h.page === p ? h.rects.map((rect) => ({ id, rect })) : [];
    });
  const rangesOn = (p) =>
    shownIds.map((id) => ranges[id] && ranges[id].page === p && { id, ...ranges[id] }).filter(Boolean);

  // 항목을 고르면 그 근거가 있는 페이지로 이동
  useEffect(() => {
    if (!item || !pageCount) return;
    const p = item.fields.map((f) => pageOf(f.id)).find(Boolean);
    if (p && p <= pageCount) setPage(p);
  }, [item?.id, pageCount]);

  const zoom = ZOOMS[zoomIdx];
  const paperW = Math.max(areaW - 24, 0) * zoom;
  const pageSize = imageMode ? source.pageImages[page - 1] : null;
  const paperH = pageSize ? (paperW * pageSize.height) / pageSize.width : null;

  // 선택한 근거가 보이도록 스크롤
  const scrollToFocus = () => {
    const id = focusIds.find((fid) => locate(fid)?.page === page);
    if (!id) {
      vScroll.current?.scrollTo({ y: 0, animated: false });
      hScroll.current?.scrollTo({ x: 0, animated: false });
      return;
    }
    if (imageMode) {
      const r = source.highlights[id].rects[0];
      vScroll.current?.scrollTo({ y: Math.max(r[1] * paperH - 60, 0), animated: true });
      hScroll.current?.scrollTo({ x: Math.max(r[0] * paperW - 16, 0), animated: true });
    } else {
      const r = ranges[id];
      const prefix = `${page}:${zoomIdx}:`;
      const line = Object.entries(lineYs.current).find(([k]) => {
        if (!k.startsWith(prefix)) return false;
        const [s, e] = k.slice(prefix.length).split("-").map(Number);
        return r.start >= s && r.start <= e;
      });
      if (line) vScroll.current?.scrollTo({ y: Math.max(line[1] - 60, 0), animated: true });
      hScroll.current?.scrollTo({ x: 0, animated: true });
    }
  };
  useEffect(() => {
    const t = setTimeout(scrollToFocus, 120);
    return () => clearTimeout(t);
  }, [item?.id, page, zoomIdx, areaW, source]);

  // 확인 필요 항목 승인/삭제
  const act = async (fn) => {
    setBusy(true);
    try {
      let res;
      for (const f of item.fields.filter((x) => NEEDS_ACTION(x.status))) {
        res = await fn(documentId, f.id);
      }
      if (res) {
        setView(res.view);
        setAnalysis(res.analysis);
      }
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const goPage = (p) => setPage(Math.min(Math.max(p, 1), pageCount));
  const tone = item ? confidenceTone(item) : null;
  const needsAction = item && item.fields.some((f) => NEEDS_ACTION(f.status));
  const failedChecks = item ? item.fields.flatMap((f) => (f.checks ?? []).filter((c) => !c.passed)) : [];
  const notOnPage = item && item.fields.every((f) => !locate(f.id));
  const reviewCount = fields.filter((f) => NEEDS_ACTION(f.status)).length;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          hitSlop={8}
          onPress={() => (backOrHome(navigation))}
          style={styles.headerSide}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>원문 근거</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* 탭 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map((t) => {
            const on = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  setTab(t.key);
                  setItemIdx(0);
                }}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 선택한 항목 요약 */}
        {item ? (
          <View style={styles.summary}>
            <View style={styles.summaryTop}>
              <Text style={styles.summaryTitle}>{item.title}</Text>
              <Text style={[styles.summaryConf, { color: tone.fg }]}>{tone.label}</Text>
            </View>
            <Text style={styles.summaryValue}>{item.value}</Text>

            {notOnPage && (
              <Text style={styles.summaryNote}>
                {item.status === "unverified"
                  ? `원문에서 근거를 찾지 못했어요. AI가 제시한 근거: “${item.fields[0].evidence?.quote ?? ""}”`
                  : "원문 페이지에서 정확한 위치를 찾지 못했어요."}
              </Text>
            )}
            {needsAction &&
              failedChecks.map((c, i) => (
                <Text key={`${c.name}-${i}`} style={styles.reason}>
                  · {c.detail}
                </Text>
              ))}
            {needsAction && !isMock && (
              <View style={styles.actions}>
                {busy ? (
                  <ActivityIndicator color={colors.stamp} />
                ) : (
                  <>
                    <Pressable style={[styles.smallBtn, styles.rejectBtn]} onPress={() => act(rejectField)}>
                      <Text style={[styles.smallBtnText, { color: colors.alert }]}>잘못됐어요, 삭제</Text>
                    </Pressable>
                    <Pressable style={[styles.smallBtn, styles.confirmBtn]} onPress={() => act(confirmField)}>
                      <Text style={[styles.smallBtnText, { color: "#fff" }]}>맞아요</Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}

            {items.length > 1 && (
              <View style={styles.itemPager}>
                <Pressable hitSlop={8} disabled={itemIdx === 0} onPress={() => setItemIdx(itemIdx - 1)}>
                  <Ionicons name="chevron-back" size={16} color={itemIdx === 0 ? colors.line : colors.muted} />
                </Pressable>
                <Text style={styles.itemPagerText}>
                  {itemIdx + 1} / {items.length}
                </Text>
                <Pressable
                  hitSlop={8}
                  disabled={itemIdx >= items.length - 1}
                  onPress={() => setItemIdx(itemIdx + 1)}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={itemIdx >= items.length - 1 ? colors.line : colors.muted}
                  />
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.summary}>
            <Text style={styles.summaryNote}>표시할 추출 항목이 없어요.</Text>
          </View>
        )}

        {/* 페이지 뷰어 */}
        <View style={styles.viewer}>
          <View style={styles.viewerBar}>
            <View style={styles.pagePill}>
              <Text style={styles.pagePillText}>
                {pageCount ? `${page} / ${pageCount}` : "- / -"}
              </Text>
            </View>
            <View style={styles.zoomBtns}>
              <Pressable
                hitSlop={6}
                disabled={zoomIdx >= ZOOMS.length - 1}
                onPress={() => setZoomIdx(zoomIdx + 1)}
                accessibilityLabel="확대"
              >
                <MaterialCommunityIcons
                  name="magnify-plus-outline"
                  size={24}
                  color={zoomIdx >= ZOOMS.length - 1 ? colors.line : colors.ink}
                />
              </Pressable>
              <Pressable
                hitSlop={6}
                disabled={zoomIdx === 0}
                onPress={() => setZoomIdx(zoomIdx - 1)}
                accessibilityLabel="축소"
              >
                <MaterialCommunityIcons
                  name="magnify-minus-outline"
                  size={24}
                  color={zoomIdx === 0 ? colors.line : colors.ink}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.pageArea} onLayout={(e) => setAreaW(e.nativeEvent.layout.width)}>
            {!source ? (
              <View style={styles.center}>
                {loadError ? (
                  <Text style={styles.summaryNote}>{loadError}</Text>
                ) : (
                  <ActivityIndicator color={colors.stamp} />
                )}
              </View>
            ) : areaW > 0 ? (
              <ScrollView ref={vScroll} nestedScrollEnabled contentContainerStyle={styles.pageScroll}>
                <ScrollView
                  ref={hScroll}
                  horizontal
                  nestedScrollEnabled
                  scrollEnabled={zoom > 1}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 12 }}
                >
                  {imageMode ? (
                    <View style={[styles.paper, { width: paperW, height: paperH }]}>
                      <AuthenticatedPageImage
                        documentId={documentId} page={page} width={1200}
                        style={{ width: paperW, height: paperH }}
                        resizeMode="contain"
                      />
                      <Boxes boxes={boxesOn(page)} focusIds={focusIds} showAll={tab === "all"} width={paperW} height={paperH} />
                    </View>
                  ) : (
                    <View style={[styles.paper, styles.textPaper, { width: paperW, padding: 20 * zoom, minHeight: VIEWER_HEIGHT - 24 }]}>
                      <TextPage
                        text={source.pages[page - 1] ?? ""}
                        ranges={rangesOn(page)}
                        focusIds={focusIds}
                        showAll={tab === "all"}
                        scale={zoom}
                        onLineLayout={(s, e, y) => (lineYs.current[`${page}:${zoomIdx}:${s}-${e}`] = y + 20 * zoom + 12)}
                      />
                    </View>
                  )}
                </ScrollView>
              </ScrollView>
            ) : null}

            {pageCount > 1 && (
              <>
                <Pressable
                  accessibilityLabel="이전 페이지"
                  disabled={page <= 1}
                  onPress={() => goPage(page - 1)}
                  style={[styles.arrow, { left: 6 }, page <= 1 && styles.arrowOff]}
                >
                  <Ionicons name="chevron-back" size={22} color="#fff" />
                </Pressable>
                <Pressable
                  accessibilityLabel="다음 페이지"
                  disabled={page >= pageCount}
                  onPress={() => goPage(page + 1)}
                  style={[styles.arrow, { right: 6 }, page >= pageCount && styles.arrowOff]}
                >
                  <Ionicons name="chevron-forward" size={22} color="#fff" />
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* 썸네일 */}
        {pageCount > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => {
              const on = p === page;
              const size = imageMode ? source.pageImages[p - 1] : null;
              const tw = THUMB_W - 4;
              const th = size ? Math.min((tw * size.height) / size.width, THUMB_H - 4) : THUMB_H - 4;
              return (
                <Pressable key={p} onPress={() => goPage(p)} style={styles.thumbWrap}>
                  <View style={[styles.thumb, on && styles.thumbOn]}>
                    {imageMode ? (
                      <View style={{ width: tw, height: th }}>
                        <AuthenticatedPageImage documentId={documentId} page={p} width={200} style={{ width: tw, height: th }} />
                        <Boxes boxes={boxesOn(p)} focusIds={focusIds} showAll width={tw} height={th} />
                      </View>
                    ) : (
                      <View style={styles.thumbText}>
                        <TextPage text={source.pages[p - 1] ?? ""} ranges={rangesOn(p)} focusIds={focusIds} showAll tiny />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.thumbNo, on && styles.thumbNoOn]}>{p}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
          <Text style={styles.noticeText}>
            {isMock ? "예시 데이터입니다. " : ""}AI가 찾은 원문 위치를 표시한 결과입니다.
          </Text>
        </View>

        <PrimaryButton
          label={reviewCount ? `확인 필요 ${reviewCount}개는 그대로 두고 진행` : "확인했어요, 이대로 진행"}
          tone="stamp"
          onPress={() => navigation.navigate("ActionPlan", { documentId, view, analysis })}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, height: 48 },
  headerSide: { width: 44, height: 40, justifyContent: "center", paddingLeft: 4 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.ink },
  container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },

  tabs: { gap: spacing.sm, paddingVertical: spacing.md },
  tab: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  tabOn: { backgroundColor: colors.stampSoft, borderColor: colors.stampSoft },
  tabText: { fontSize: 14, fontWeight: "600", color: "#4A5568" },
  tabTextOn: { color: colors.stamp, fontWeight: "700" },

  summary: { backgroundColor: UI.soft, borderRadius: 14, padding: spacing.lg, marginBottom: spacing.md },
  summaryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  summaryTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  summaryConf: { fontSize: 12, fontWeight: "700" },
  summaryValue: { fontSize: 17, fontWeight: "700", color: colors.ink, lineHeight: 24 },
  summaryNote: { fontSize: 12, color: colors.muted, marginTop: spacing.sm, lineHeight: 17 },
  reason: { fontSize: 12, color: colors.alert, marginTop: spacing.xs, lineHeight: 17 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.md },
  smallBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  confirmBtn: { backgroundColor: colors.stamp },
  rejectBtn: { backgroundColor: colors.alertSoft },
  smallBtnText: { fontSize: 13, fontWeight: "700" },
  itemPager: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: spacing.sm },
  itemPagerText: { fontSize: 12, color: colors.muted, fontWeight: "600" },

  viewer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  viewerBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  pagePill: { backgroundColor: UI.soft, borderRadius: radius.sm, paddingHorizontal: 12, height: 30, justifyContent: "center" },
  pagePillText: { fontSize: 13, fontWeight: "700", color: colors.ink },
  zoomBtns: { flexDirection: "row", gap: 14, paddingRight: 4 },
  pageArea: { height: VIEWER_HEIGHT, backgroundColor: UI.viewerBg, borderRadius: 10, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  pageScroll: { paddingVertical: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  paper: {
    backgroundColor: "#fff",
    borderRadius: 2,
    shadowColor: "#1F2E2B",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  textPaper: {},
  pageText: { color: "#2D3748" },
  pageHeading: { fontWeight: "700", color: colors.ink },
  arrow: {
    position: "absolute",
    top: VIEWER_HEIGHT / 2 - 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: UI.arrow,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowOff: { opacity: 0.25 },

  thumbs: { gap: 10, paddingVertical: spacing.md },
  thumbWrap: { alignItems: "center" },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbOn: { borderWidth: 2, borderColor: colors.stamp },
  thumbText: { width: THUMB_W - 4, height: THUMB_H - 4, padding: 3, overflow: "hidden" },
  thumbNo: { fontSize: 12, color: colors.muted, marginTop: 4 },
  thumbNoOn: { color: colors.stamp, fontWeight: "700" },

  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: UI.soft,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.lg,
  },
  noticeText: { fontSize: 12, color: colors.muted, flex: 1 },
});
