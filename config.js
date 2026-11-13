// Shared settings for the public website and the staff portal.
// The publishable key is designed to be public: it can only do what the
// database's own permission rules allow (see supabase/001_bookings.sql).
// NEVER put the "secret" or "service_role" key in this file.
window.AG_CONFIG = {
  SUPABASE_URL: "https://rkovryktdzhaqjikuzpi.supabase.co",
  SUPABASE_KEY: "sb_publishable_PJtBZWilVibJbtV62hU8WA_iSVXD3Ac",

  // Where the "Staff Login" link on the public site goes.
  STAFF_PORTAL_URL: "staff/",

  // Optional gallery photos. Add your own vehicle photos here, for example:
  // { src: "assets/gallery/sultan.jpg", alt: "Karin Sultan after a respray", caption: "Respray" }
  GALLERY: []
};
