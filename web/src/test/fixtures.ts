import type { PapersPayload } from "../types";

export const fixturePayload: PapersPayload = {
  generated_at: "2026-04-15T11:56:08+00:00",
  source_csv: "data/iclr2026/papers.csv",
  columns: [
    "paper_id",
    "paper_url",
    "title",
    "authors",
    "topic_tag",
    "session_title",
    "session_type",
    "session_date",
    "session_start",
    "session_end",
    "room",
    "abstract",
    "project_page",
    "pdf_url",
    "video_url",
    "poster_url",
    "code_url",
    "source_list_url",
    "source_detail_url",
    "schedule_source",
    "scraped_at",
    "status",
    "notes"
  ],
  total_papers: 3,
  topic_tags: [
    "Social Aspects->Trustworthy Machine Learning",
    "Computer Vision->Vision Models & Multimodal"
  ],
  session_dates: ["2026-04-23", "2026-04-24"],
  session_types: ["Oral", "Poster"],
  unresolved_schedule_count: 1,
  papers: [
    {
      paper_id: "p1",
      paper_url: "https://example.test/p1",
      title: "Trustworthy Agents for Long-Horizon Planning",
      authors: "Ada Lovelace · Grace Hopper",
      topic_tag: "Social Aspects->Trustworthy Machine Learning",
      session_title: "",
      session_type: "Poster",
      session_date: "2026-04-23",
      session_start: "11:15",
      session_end: "13:45",
      room: "Pavilion 4",
      abstract: "A paper about trustworthy planning agents.",
      project_page: "https://example.test/project/p1",
      pdf_url: "",
      video_url: "",
      poster_url: "",
      code_url: "https://github.com/example/p1",
      source_list_url: "",
      source_detail_url: "",
      schedule_source: "detail_page",
      scraped_at: "2026-04-15T11:56:08+00:00",
      status: "ok",
      notes: "",
      authors_list: ["Ada Lovelace", "Grace Hopper"],
      topic_tags: ["Social Aspects->Trustworthy Machine Learning"],
      topic_parts: [
        {
          raw: "Social Aspects->Trustworthy Machine Learning",
          group: "Social Aspects",
          name: "Trustworthy Machine Learning"
        }
      ],
      has_schedule: true,
      search_blob: "trustworthy agents for long-horizon planning ada lovelace grace hopper trustworthy machine learning a paper about trustworthy planning agents."
    },
    {
      paper_id: "p2",
      paper_url: "https://example.test/p2",
      title: "Multimodal Memory for Conference Navigation",
      authors: "Geoffrey Hinton",
      topic_tag: "Computer Vision->Vision Models & Multimodal",
      session_title: "Oral Session 2",
      session_type: "Oral",
      session_date: "2026-04-24",
      session_start: "06:30",
      session_end: "09:00",
      room: "Hall A",
      abstract: "A paper about multimodal session memory.",
      project_page: "",
      pdf_url: "https://example.test/p2.pdf",
      video_url: "",
      poster_url: "",
      code_url: "",
      source_list_url: "",
      source_detail_url: "",
      schedule_source: "calendar_exact_title",
      scraped_at: "2026-04-15T11:56:08+00:00",
      status: "ok",
      notes: "",
      authors_list: ["Geoffrey Hinton"],
      topic_tags: ["Computer Vision->Vision Models & Multimodal"],
      topic_parts: [
        {
          raw: "Computer Vision->Vision Models & Multimodal",
          group: "Computer Vision",
          name: "Vision Models & Multimodal"
        }
      ],
      has_schedule: true,
      search_blob: "multimodal memory for conference navigation geoffrey hinton vision models multimodal a paper about multimodal session memory."
    },
    {
      paper_id: "p3",
      paper_url: "https://example.test/p3",
      title: "Schedule Missing Paper",
      authors: "Jane Doe",
      topic_tag: "Social Aspects->Trustworthy Machine Learning",
      session_title: "",
      session_type: "",
      session_date: "",
      session_start: "",
      session_end: "",
      room: "",
      abstract: "No schedule yet.",
      project_page: "",
      pdf_url: "",
      video_url: "",
      poster_url: "",
      code_url: "",
      source_list_url: "",
      source_detail_url: "",
      schedule_source: "",
      scraped_at: "2026-04-15T11:56:08+00:00",
      status: "missing_schedule",
      notes: "missing fields: schedule",
      authors_list: ["Jane Doe"],
      topic_tags: ["Social Aspects->Trustworthy Machine Learning"],
      topic_parts: [
        {
          raw: "Social Aspects->Trustworthy Machine Learning",
          group: "Social Aspects",
          name: "Trustworthy Machine Learning"
        }
      ],
      has_schedule: false,
      search_blob: "schedule missing paper jane doe trustworthy machine learning no schedule yet."
    }
  ]
};
