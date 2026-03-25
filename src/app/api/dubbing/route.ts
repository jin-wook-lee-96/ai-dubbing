import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const maxDuration = 120; // 2분 타임아웃

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// eleven_multilingual_v2 지원 음성 (무료 플랜 사용 가능)
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { blobUrl, targetLang } = await req.json();

  if (!blobUrl || !targetLang) {
    return NextResponse.json({ error: "Missing blobUrl or targetLang" }, { status: 400 });
  }

  try {
    // Blob에서 파일 fetch
    const fileRes = await fetch(blobUrl);
    if (!fileRes.ok) throw new Error("Failed to fetch uploaded file");
    const fileBlob = await fileRes.blob();
    const fileName = blobUrl.split("/").pop() ?? "audio_file";

    // Step 1: ElevenLabs STT — 음성 → 텍스트
    const sttFormData = new FormData();
    sttFormData.append("file", fileBlob, fileName);
    sttFormData.append("model_id", "scribe_v1");

    const sttRes = await fetch(`${ELEVENLABS_BASE}/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: sttFormData,
    });

    if (!sttRes.ok) {
      const err = await sttRes.text();
      throw new Error(`STT failed: ${err}`);
    }

    const sttData = await sttRes.json();
    const transcript: string = sttData.text;

    // Step 2: OpenAI 번역
    const translationRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the following text to ${targetLang}. Return only the translated text without any explanation.`,
        },
        { role: "user", content: transcript },
      ],
    });

    const translatedText = translationRes.choices[0].message.content!;

    // Step 3: ElevenLabs TTS — 번역된 텍스트 → 음성
    const ttsRes = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${DEFAULT_VOICE_ID}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: translatedText,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      throw new Error(`TTS failed: ${err}`);
    }

    const audioBuffer = await ttsRes.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="dubbed_${targetLang}.mp3"`,
        "X-Transcript": encodeURIComponent(transcript),
        "X-Translation": encodeURIComponent(translatedText),
      },
    });
  } catch (error) {
    console.error("Dubbing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dubbing failed" },
      { status: 500 }
    );
  }
}
