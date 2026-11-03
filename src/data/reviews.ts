export type Reviewer = {
  slug: string;
  name: string;
  role: string;
  bio: string;
  avatar: string | null;
  rating: number;
  text: string;
  youtubeId?: string;
  screenshots?: string[];
  nameConfirmed: boolean;
};

/** Example testimonials only -- a fresh install has no real reviews yet.
 * Replace these with your own (or remove them) once you have real ones; see
 * src/lib/curatedReviews.ts for how a deployment's own curated reviews are
 * stored and read instead of being hardcoded here. */
export const reviewers: Reviewer[] = [
  {
    slug: "alex-rivera",
    name: "Alex Rivera",
    role: "Founder, Example Co.",
    bio: "Alex runs Example Co. and used this platform to streamline their business operations.",
    avatar: null,
    rating: 5,
    text: "This is a sample testimonial. Replace it with a real review once you have one, or remove it entirely.",
    nameConfirmed: true,
  },
  {
    slug: "jordan-lee",
    name: "Jordan Lee",
    role: "Independent Consultant",
    bio: "Jordan is an independent consultant who uses this platform to run client work.",
    avatar: null,
    rating: 5,
    text: "Another sample testimonial, shown here just to demonstrate the layout for a second reviewer.",
    nameConfirmed: true,
  },
];
