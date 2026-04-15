export interface TopicPart {
  raw: string;
  group: string;
  name: string;
}

export interface Paper {
  paper_id: string;
  paper_url: string;
  title: string;
  authors: string;
  topic_tag: string;
  session_title: string;
  session_type: string;
  session_date: string;
  session_start: string;
  session_end: string;
  room: string;
  abstract: string;
  project_page: string;
  pdf_url: string;
  video_url: string;
  poster_url: string;
  code_url: string;
  source_list_url: string;
  source_detail_url: string;
  schedule_source: string;
  scraped_at: string;
  status: string;
  notes: string;
  authors_list: string[];
  topic_tags: string[];
  topic_parts: TopicPart[];
  has_schedule: boolean;
  search_blob: string;
}

export interface PapersPayload {
  generated_at: string;
  source_csv: string;
  columns: string[];
  total_papers: number;
  topic_tags: string[];
  session_dates: string[];
  session_types: string[];
  unresolved_schedule_count: number;
  papers: Paper[];
}

export interface Filters {
  query: string;
  selectedTopics: string[];
  selectedDate: string;
  selectedSessionType: string;
  bookmarkedOnly: boolean;
  scheduledOnly: boolean;
}

export interface AgendaGroup {
  date: string;
  label: string;
  papers: Paper[];
}
