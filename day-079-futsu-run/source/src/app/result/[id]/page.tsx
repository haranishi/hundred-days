import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decodeDemoResult } from "@/lib/api";
import ResultView from "@/components/ResultView";
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ data?: string }>;
};
async function load({ params, searchParams }: Props) {
  const { id } = await params;
  const { data } = await searchParams;
  return id === "demo" && typeof data === "string"
    ? decodeDemoResult(data)
    : null;
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const result = await load(props);
  if (!result)
    return {
      title: "結果が見つかりません",
      robots: { index: false, follow: false },
    };
  const { id } = await props.params;
  const { data } = await props.searchParams;
  const query = `data=${encodeURIComponent(data!)}`;
  const title = `【お試し結果】普通度${result.score}％・${result.typeName} | あなたの普通、何％？`;
  const canonical = `/result/${id}?${query}`;
  return {
    title,
    description: result.comment,
    alternates: { canonical },
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description: result.comment,
      url: canonical,
      images: [`/api/og?${query}`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: result.comment,
      images: [`/api/og?${query}`],
    },
  };
}
export default async function ResultPage(props: Props) {
  const result = await load(props);
  if (!result) notFound();
  return <ResultView result={result} />;
}
