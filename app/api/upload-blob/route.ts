import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN 미설정" }, { status: 500 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "파일 없음" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "video/webm";
    const ext = contentType.startsWith("video/mp4") ? "mp4" : "webm";
    const blob = await put(
      `card-videos/${Date.now()}_cards.${ext}`,
      buffer,
      { access: "private", contentType, token },
    );

    return NextResponse.json({ url: blob.downloadUrl || blob.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "업로드 실패" }, { status: 500 });
  }
}
