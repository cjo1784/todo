import TodoBoard from "@/components/TodoBoard";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { date } = await searchParams;
  return <TodoBoard date={typeof date === "string" && date ? date : undefined} />;
}
