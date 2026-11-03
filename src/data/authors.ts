export type Author = {
  slug: string;
  name: string;
  role: string;
  bio: string;
  avatar: string | null;
  social: { label: string; url: string }[];
};

export const authors: Record<string, Author> = {
  "shubho-dey": {
    slug: "shubho-dey",
    name: "Shubho Dey",
    role: "Founder, Indish Marketer",
    bio: "Shubho runs Indish Marketer, building automation and AI agent systems for coaches, consultants, and service providers. He writes about the tools and workflows he builds and uses himself.",
    avatar: "https://images.indishmarketer.com/author/shubho-dey.webp",
    social: [
      { label: "X", url: "https://x.com/indishmarketer" },
      { label: "LinkedIn", url: "https://www.linkedin.com/in/indishmarketer/" },
      { label: "YouTube", url: "https://youtube.com/@indishmarketer" },
    ],
  },
};

export const defaultAuthorSlug = "shubho-dey";
