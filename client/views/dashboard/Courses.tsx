"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, GraduationCap, Search, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/widgets/PageHeader";
import { fetchLearnerCourses, apiEnrollInCourse } from "@/lib/api/lms";
import { cn } from "@/lib/utils";

import type { LearnerCourse } from "@/lib/api/lms";

// The 6 AI-branded flagship seed courses — grouped to the top of the page
// regardless of enrollment status. There's no "featured" flag on the courses
// table, so this is a hardcoded title allowlist (case-insensitive exact match).
const MAIN_COURSE_TITLES = [
  "AI Fundamentals",
  "AI Ethics and Data Privacy",
  "Generative AI, LLMs and Diffusion Models",
  "AI in Daily Workflows",
  "Prompt Engineering and AI Troubleshooting",
  "AI's Future and Continuous Learning",
].map((t) => t.toLowerCase());

function isMainCourse(title: string): boolean {
  return MAIN_COURSE_TITLES.includes(title.trim().toLowerCase());
}

function courseCta(c: LearnerCourse): string {
  if (!c.isEnrolled) return "Start course";
  return c.progressPercentage === 100 ? "Review" : "Continue";
}

function CourseCard({
  c,
  i,
  ctaLabel,
  isPending,
  onCta,
}: {
  c: LearnerCourse;
  i: number;
  ctaLabel: string;
  isPending: boolean;
  onCta: () => void;
}) {
  const pct = c.progressPercentage;
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * i, duration: 0.4 }}
      whileHover={{ y: -6 }}
      className="group relative overflow-hidden rounded-2xl bg-white border border-brand-surface-2 hover:border-brand-primary/40 hover:shadow-xl transition-all"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        {c.cover ? (
          <img
            src={c.cover}
            alt={c.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-brand-primary via-brand-primary-dark to-brand-violet flex items-center justify-center">
            <BookOpenCheck className="w-10 h-10 text-white/70" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <span
          className={cn(
            "absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm",
            c.difficulty === "Beginner" && "bg-emerald-500 text-white",
            c.difficulty === "Intermediate" && "bg-amber-500 text-white",
            c.difficulty === "Advanced" && "bg-rose-500 text-white",
          )}
        >
          {c.difficulty}
        </span>
      </div>

      {c.isEnrolled && (
        <div className="px-5 pt-3">
          <div className="flex items-center justify-between text-[10px] font-bold text-brand-text-muted uppercase tracking-wider mb-1.5">
            <span>Progress</span>
            <span className="text-brand-primary">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-brand-surface-2 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-brand-primary via-brand-primary to-brand-primary-dark"
            />
          </div>
        </div>
      )}

      <div className="p-5 pt-3 flex flex-col gap-2">
        <h3 className="font-bold text-brand-text-primary leading-snug line-clamp-2">{c.title}</h3>
        {c.description && (
          <p className="text-xs text-brand-text-muted line-clamp-2 leading-relaxed">
            {c.description}
          </p>
        )}
        <div className="flex items-center gap-1 text-[11px] text-brand-text-muted">
          <Users className="w-3 h-3" />
          <span>
            {(c.enrolledCount ?? 0).toLocaleString()} learner
            {(c.enrolledCount ?? 0) !== 1 ? "s" : ""} enrolled
          </span>
        </div>
        <button
          onClick={onCta}
          disabled={isPending}
          className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-4 py-2.5 text-xs font-bold shadow-md shadow-brand-primary/30 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-primary/40 transition-all disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <GraduationCap className="w-3.5 h-3.5" />
          )}
          {isPending ? "Enrolling…" : ctaLabel}
        </button>
      </div>
    </motion.article>
  );
}

export default function CoursesPage() {
  const [query, setQuery] = useState("");
  const [showAllAdditional, setShowAllAdditional] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["learner-courses"],
    queryFn: fetchLearnerCourses,
  });

  const enrollMutation = useMutation({
    mutationFn: apiEnrollInCourse,
    onSuccess: (_, courseId) => {
      queryClient.invalidateQueries({ queryKey: ["learner-courses"] });
      router.push(`/dashboard/courses/${courseId}`);
    },
    onError: () => toast.error("Failed to enroll. Please try again."),
  });

  const filtered = courses.filter(
    (c) => !query || c.title.toLowerCase().includes(query.toLowerCase()),
  );
  // "Your Courses" groups by course identity (the 6 flagship AI courses),
  // not enrollment status — a main course can appear here whether or not
  // the user has enrolled yet.
  const yourCourses = filtered
    .filter((c) => isMainCourse(c.title))
    .sort((a, b) => {
      // enrolled + in-progress first, then enrolled-not-started, then completed, then not-enrolled
      const rank = (c: LearnerCourse) => {
        if (!c.isEnrolled) return 3;
        if (c.progressPercentage > 0 && c.progressPercentage < 100) return 0;
        if (c.progressPercentage === 0) return 1;
        return 2;
      };
      return rank(a) - rank(b);
    });
  const additionalCourses = filtered.filter((c) => !isMainCourse(c.title));

  const searchBar = (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search courses…"
        className="rounded-xl border border-brand-surface-2 bg-white pl-9 pr-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
      />
    </div>
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageHeader
          eyebrow="Learning"
          title="Your"
          highlight="courses"
          subtitle="Practical, bite-sized courses to integrate AI into your business — built with global SME experts."
          actions={searchBar}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white border border-brand-surface-2 h-72 animate-pulse"
            />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        eyebrow="Learning"
        title="Your"
        highlight="courses"
        subtitle="Practical, bite-sized courses to integrate AI into your business — built with global SME experts."
        actions={searchBar}
      />

      {filtered.length === 0 && (
        <p className="text-center text-sm text-brand-text-muted py-12">
          No courses match your search.
        </p>
      )}

      {/* Your Courses — the 6 flagship AI courses, always on top */}
      {yourCourses.length > 0 && (
        <section className="mb-10">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-brand-text-primary">Your Courses</h2>
            <p className="text-sm text-brand-text-muted mt-0.5">
              The core AI curriculum — resume where you left off or get started
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {yourCourses.map((c, i) => {
              const isPending = enrollMutation.isPending && enrollMutation.variables === c.id;
              return (
                <CourseCard
                  key={c.id}
                  c={c}
                  i={i}
                  ctaLabel={courseCta(c)}
                  isPending={isPending}
                  onCta={() =>
                    c.isEnrolled
                      ? router.push(`/dashboard/courses/${c.id}`)
                      : enrollMutation.mutate(c.id)
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Additional Courses */}
      {additionalCourses.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-brand-text-primary">Additional Courses</h2>
            <p className="text-sm text-brand-text-muted mt-0.5">
              Practical courses built for SME founders — short videos, real insights, instant impact
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(showAllAdditional ? additionalCourses : additionalCourses.slice(0, 3)).map((c, i) => {
              const isPending = enrollMutation.isPending && enrollMutation.variables === c.id;
              return (
                <CourseCard
                  key={c.id}
                  c={c}
                  i={i}
                  ctaLabel={courseCta(c)}
                  isPending={isPending}
                  onCta={() =>
                    c.isEnrolled
                      ? router.push(`/dashboard/courses/${c.id}`)
                      : enrollMutation.mutate(c.id)
                  }
                />
              );
            })}
          </div>
          {additionalCourses.length > 3 && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setShowAllAdditional((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl border border-brand-surface-2 bg-white px-5 py-2 text-sm font-semibold text-brand-text-primary hover:border-brand-primary/40 hover:shadow transition-all"
              >
                {showAllAdditional
                  ? `Show less`
                  : `Load more (${additionalCourses.length - 3} more)`}
              </button>
            </div>
          )}
        </section>
      )}
    </DashboardLayout>
  );
}
