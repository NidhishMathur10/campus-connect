export const QA_SUBJECTS = [
  "General Studies",
  "Mathematics",
  "Programming",
  "Physics",
  "Basic Electrical",
  "Introduction to AI",
  "Communication Skills",
  "Environmental Studies",
  "Other",
] as const;
export type QaSubject = (typeof QA_SUBJECTS)[number];
