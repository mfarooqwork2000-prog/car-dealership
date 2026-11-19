import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyState, PageSpinner, Skeleton } from "@/components/ui";
import { Pagination } from "@/components/ui/DataTable";
import { RichHtml } from "@/components/public/sections";
import { Seo } from "@/features/site";
import { api } from "@/services/api";
import { dateShort } from "@/services/format";
import { NotFound } from "./CmsPage";

interface Post { id: string; slug: string; title: string; excerpt?: string; coverUrl?: string; publishedAt: string; body?: string; author?: { firstName: string; lastName: string } }

export function BlogList() {
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get("page")) || 1;
  const q = useQuery({ queryKey: ["blog", page], queryFn: () => api.list<Post>(`/public/blog?page=${page}`) });
  return (
    <div className="container-x py-12">
      <Seo title="News & Blog" description="Buying guides, news and updates from our dealership." />
      <p className="eyebrow">Blog</p><h1 className="mb-8 text-4xl">News &amp; Insights</h1>
      {q.isLoading ? <div className="grid gap-6 md:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div> : !q.data?.data.length ? <EmptyState title="No posts yet" description="Check back soon." /> : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{q.data.data.map((p) => (
          <Link key={p.id} to={`/blog/${p.slug}`} className="group overflow-hidden rounded-lg border border-ink/10 bg-white shadow-sm transition hover:shadow-lg">
            {p.coverUrl && <img src={p.coverUrl} alt="" loading="lazy" className="aspect-video w-full object-cover" />}
            <div className="p-5"><p className="text-xs text-ink/50">{dateShort(p.publishedAt)}</p><h2 className="mt-1 text-xl group-hover:text-accent">{p.title}</h2>{p.excerpt && <p className="mt-2 text-sm text-ink/65">{p.excerpt}</p>}</div>
          </Link>))}</div>
      )}
      <div className="mt-8"><Pagination page={page} totalPages={(q.data?.meta?.totalPages as number) ?? 1} onPage={(p) => setSp({ page: String(p) })} /></div>
    </div>
  );
}

export function BlogPost() {
  const { slug } = useParams();
  const q = useQuery({ queryKey: ["post", slug], queryFn: () => api.get<Post>(`/public/blog/${slug}`), retry: false });
  if (q.isLoading) return <PageSpinner />;
  if (!q.data) return <NotFound />;
  const p = q.data;
  return (
    <article className="container-x max-w-3xl py-12">
      <Seo title={p.title} description={p.excerpt} image={p.coverUrl} />
      <p className="text-sm text-ink/50">{dateShort(p.publishedAt)}{p.author && ` · ${p.author.firstName} ${p.author.lastName}`}</p>
      <h1 className="my-3 text-4xl">{p.title}</h1>
      {p.coverUrl && <img src={p.coverUrl} alt="" className="my-6 w-full rounded-lg" />}
      <RichHtml html={p.body ?? ""} />
    </article>
  );
}
