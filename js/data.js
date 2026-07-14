/* ============================================================
   Seed content — used in MOCK mode and to seed Supabase.
   The same shapes are returned by the live API layer (js/api.js).
   ============================================================ */
window.SEED = {
  sermons: [
    { id: 's1', title: 'The Anchor for Your Soul', speaker: 'Pastor David Reyes', series: 'Hope That Holds', duration: '38:12', date: '2026-07-06', category: 'Faith', featured: true, hue: 212, blurb: 'When the storms of life hit, where do you turn? Discover the unshakable hope found in Hebrews 6.' },
    { id: 's2', title: 'Grace Upon Grace', speaker: 'Pastor Anna Cole', series: 'Rediscovering Grace', duration: '32:45', date: '2026-06-29', category: 'Grace', hue: 268, blurb: 'A fresh look at the endless grace of God and how it reshapes everyday life.' },
    { id: 's3', title: 'Built to Belong', speaker: 'Pastor David Reyes', series: 'Better Together', duration: '41:03', date: '2026-06-22', category: 'Community', hue: 168, blurb: 'We were never meant to walk alone. Exploring the beauty of biblical community.' },
    { id: 's4', title: 'The Generous Life', speaker: 'Elder Marcus Bell', series: 'Kingdom Economy', duration: '29:57', date: '2026-06-15', category: 'Stewardship', hue: 28, blurb: 'What if generosity was less about giving and more about becoming?' },
    { id: 's5', title: 'Prayer That Moves', speaker: 'Pastor Anna Cole', series: 'The Secret Place', duration: '35:20', date: '2026-06-08', category: 'Prayer', hue: 320, blurb: 'Learning to pray with confidence, persistence, and expectation.' },
    { id: 's6', title: 'Light in the Dark', speaker: 'Pastor David Reyes', series: 'Hope That Holds', duration: '27:41', date: '2026-06-01', category: 'Faith', hue: 200, blurb: 'No darkness is deep enough to overcome the light of Christ.' },
    { id: 's7', title: 'Roots and Wings', speaker: 'Pastor Grace Kim', series: 'Family Matters', duration: '44:18', date: '2026-05-25', category: 'Family', hue: 140, blurb: 'Raising the next generation with both deep roots and bold faith.' },
    { id: 's8', title: 'The Weight of Words', speaker: 'Elder Marcus Bell', series: 'Wisdom for Living', duration: '31:09', date: '2026-05-18', category: 'Wisdom', hue: 48, blurb: 'Our words carry weight. James shows us how to steward them well.' },
    { id: 's9', title: 'Unhurried', speaker: 'Pastor Anna Cole', series: 'Rest for the Weary', duration: '36:52', date: '2026-05-11', category: 'Rest', hue: 190, blurb: 'Escaping the tyranny of hurry to find the rhythm of grace.' }
  ],
  events: [
    { id: 'e1', title: 'Sunday Gathering', date: '2026-07-19', time: '9:00 & 11:00 AM', location: 'Main Auditorium', tag: 'Weekly', hue: 212, blurb: 'Join us for worship, teaching, and community every Sunday morning.' },
    { id: 'e2', title: 'Summer Baptism Celebration', date: '2026-07-26', time: '5:00 PM', location: 'Riverside Park', tag: 'Special', hue: 190, blurb: 'Celebrate new life in Christ with baptisms, food, and worship by the water.' },
    { id: 'e3', title: 'Young Adults Night', date: '2026-07-22', time: '7:00 PM', location: 'The Loft', tag: 'Young Adults', hue: 268, blurb: 'Food, worship, and real conversation for 18–30s.' },
    { id: 'e4', title: 'Serve the City Day', date: '2026-08-02', time: '8:30 AM', location: 'Citywide', tag: 'Outreach', hue: 28, blurb: 'One day, dozens of projects, one mission: love our neighbors well.' },
    { id: 'e5', title: 'Marriage Workshop', date: '2026-08-09', time: '10:00 AM', location: 'Room 210', tag: 'Marriage', hue: 320, blurb: 'A half-day intensive to strengthen and refresh your marriage.' },
    { id: 'e6', title: 'Kids Summer Camp', date: '2026-08-11', time: 'All Week', location: 'Camp Redwood', tag: 'Kids', hue: 140, blurb: 'A week of adventure, faith, and unforgettable memories for grades 1–5.' }
  ],
  ministries: [
    { id: 'm1', name: 'Grace Kids', audience: 'Birth – Grade 5', hue: 140, blurb: 'Safe, fun, Bible-based environments where kids discover Jesus.', when: 'Sundays 9 & 11 AM' },
    { id: 'm2', name: 'Students', audience: 'Grades 6 – 12', hue: 268, blurb: 'Middle & high schoolers growing in faith and friendship.', when: 'Wednesdays 6:30 PM' },
    { id: 'm3', name: 'Young Adults', audience: 'Ages 18 – 30', hue: 320, blurb: 'Community, worship, and purpose for the next generation.', when: 'Tuesdays 7 PM' },
    { id: 'm4', name: 'Small Groups', audience: 'Everyone', hue: 168, blurb: 'Life is better together. Find a group near you.', when: 'Various times' },
    { id: 'm5', name: 'Worship & Arts', audience: 'Musicians & creatives', hue: 200, blurb: 'Use your gifts to help people encounter God.', when: 'Rehearsals Thursdays' },
    { id: 'm6', name: 'Outreach', audience: 'Servants at heart', hue: 28, blurb: 'Loving our city through service and generosity.', when: 'Monthly projects' }
  ],
  funds: ['General Fund', 'Missions', 'Building Fund', 'Youth Ministry', 'Benevolence'],
  stats: { given: 2480000, families: 1240, projects: 68, countries: 14, members: 3200 },
  // Stand-in for the bunny.net library in mock mode (live mode calls /api/videos).
  bunnyLibrary: [
    { guid: 'a1b2c3d4-0001-4a1a-9b2b-000000000001', title: 'Sunday Service — July 6', length: 3820, status: 4, thumbnail: '' },
    { guid: 'a1b2c3d4-0002-4a1a-9b2b-000000000002', title: 'Sunday Service — June 29', length: 3105, status: 4, thumbnail: '' },
    { guid: 'a1b2c3d4-0003-4a1a-9b2b-000000000003', title: 'Baptism Celebration 2026', length: 1240, status: 4, thumbnail: '' },
    { guid: 'a1b2c3d4-0004-4a1a-9b2b-000000000004', title: 'Youth Camp Recap', length: 540, status: 4, thumbnail: '' }
  ]
};
