import { redirect } from "next/navigation";

export default async function PuzzleIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/puzzle/${id}/scanner`);
}
