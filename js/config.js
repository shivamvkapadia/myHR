// myHR runtime configuration.
//
// Leave SUPABASE_URL / SUPABASE_ANON_KEY empty to run in Demo mode — all data
// lives in this browser (localStorage + IndexedDB). Paste your project's values
// (Supabase dashboard → Project Settings → API) to switch to the real backend.
//
// The anon key is designed to be public. Row Level Security in
// supabase/schema.sql is what protects your data.

export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

// Name of the Edge Function that posts to Slack (supabase/functions/slack-notify).
export const SLACK_FUNCTION = "slack-notify";

export const APP_NAME = "myHR";
