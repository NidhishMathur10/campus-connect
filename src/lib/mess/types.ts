import type { MenuItem, Meal, MessKey, Timings } from "@/config/mess";
import type { MealCommentSummary } from "@/lib/ai/mess";

/** One mess's resolved weekly menu (own rows override the shared 'all' menu). */
export interface MenuData {
  mess: MessKey;
  title: string;
  semester: string;
  footer: string;
  /** grid[day 0–6][meal] */
  grid: Record<Meal, MenuItem[]>[];
  notes: Record<string, string>; // `${day}:${meal}` -> note
  extras: { name: string; meals: Meal[] }[];
  timings: Timings;
}

export interface MyRating {
  meal: Meal;
  rating: number;
  comment: string | null;
}

export interface RatingsDashboard {
  total: number;
  avg: number | null;
  /** Average + count per meal over the last 30 days. */
  byMeal: { meal: Meal; avg: number | null; count: number }[];
  byDay: { day: number; avg: number | null; count: number; meals: Record<Meal, number | null> }[];
  /** Dishes ranked by the average rating of the meals they were served in (lowest first). */
  lowestDishes: { name: string; avg: number; count: number }[];
  commentCount: number;
  summary: MealCommentSummary | null;
}
