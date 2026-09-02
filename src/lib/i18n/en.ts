/**
 * English, and the shape every other language must have.
 *
 * `Messages` is derived from this object, so a language file missing a key
 * doesn't compile — completeness is the type-checker's job rather than a
 * test's. What a test *can* catch, and does (see i18n.test.ts), is the subtler
 * failure: a translation that drops a `{placeholder}`, which turns "3 places
 * left" into "places left" and loses the number silently.
 *
 * Keys are grouped by where they appear rather than by what they say, so a
 * translator working through a screen finds its strings together.
 */
export const en = {
  common: {
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    remove: "Remove",
    send: "Send",
    sending: "Sending…",
    back: "Back",
    loading: "Loading…",
    nothingYet: "Nothing yet.",
    optional: "optional",
    signIn: "Sign in",
    language: "Language",
  },

  nav: {
    home: "Home",
    search: "Search",
    live: "Live",
    services: "Services",
    events: "Events",
    forms: "Forms",
    prayer: "Prayer",
    groups: "Small groups",
    recentlyPlayed: "Recently played",
    favorites: "Favorites",
    watchLater: "Watch later",
    playlists: "Playlists",
    subscriptions: "Subscriptions",
    downloads: "Downloads",
    yourEvents: "Your events",
    yourGroups: "Your groups",
    televisions: "Televisions",
    profile: "Profile",
    admin: "Admin",
    new: "New",
    library: "Library",
    yourLibrary: "Your library",
  },

  events: {
    title: "Events",
    subtitle: "What's on, and how to sign up.",
    nothingComingUp: "Nothing coming up.",
    subscribeToCalendar: "Subscribe in your calendar",
    addToCalendar: "Add to my calendar",

    signUpOpen: "Sign-up open",
    signUpClosed: "Sign-up closed",
    signUpNotOpen: "Sign-up not open yet",
    full: "Full",
    fullWaitlist: "Full — waiting list open",
    placesLeft: "{count} places left",
    onePlaceLeft: "1 place left",
    alreadyHappened: "This has already happened.",
    signUp: "Sign up",
    joinWaitingList: "Join the waiting list",
    signMeUp: "Sign me up",
    yourName: "Your name",
    email: "Email",
    phone: "Phone",
    bringing: "Bringing anyone? (up to {count})",
    anythingToKnow: "Anything we should know?",
    youreSignedUp: "You're signed up.",
    youreWaiting: "You're on the waiting list.",
    cancelPlace: "Cancel my place",
    seeWhatsOn: "See what's on",
    yourEvents: "Your events",
    yourEventsSubtitle: "What you've signed up for.",
    notSignedUp: "You haven't signed up for anything.",
  },

  forms: {
    title: "Forms",
    nothingToFill: "Nothing to fill in at the moment.",
    noQuestions: "This form has no questions on it yet.",
    thankYou: "Thank you — that's been sent.",
    needed: "This one's needed.",
    choose: "Choose…",
    send: "Send",
  },

  prayer: {
    title: "Prayer",
    subtitle: "Ask, and pray for what others have asked. Everything is read by somebody before it goes up.",
    askForPrayer: "Ask for prayer",
    whatToPrayFor: "What would you like people to pray for?",
    postAnonymously: "Post this anonymously",
    whoCanSee: "Who can see it",
    seenByMembers: "Members",
    seenByEveryone: "Anyone who visits the site",
    seenByLeaders: "Only the people who look after prayer",
    waitingToBeRead: "Waiting to be read — only you can see this.",
    willBeRead: "Thank you. Somebody will read it before it goes on the wall.",
    iPrayed: "I prayed for this",
    youPrayed: "You prayed",
    onePersonPrayed: "1 person has prayed",
    peoplePrayed: "{count} people have prayed",
    answered: "Answered",
    takeDown: "Take down",
    nothingOnWall: "Nothing on the wall yet.",
    anonymous: "Anonymous",
    yourNameOptional: "Your name (optional)",
    takeThisDown: "Take this down?",
    couldntSend: "Couldn't send that.",
    send: "Send",
  },

  groups: {
    title: "Small groups",
    subtitle: "Where people meet during the week.",
    noneListed: "No groups listed yet.",
    ledBy: "Led by {names}",
    onePerson: "1 person",
    people: "{count} people",
    youreIn: "You're in this group",
    youveAsked: "You've asked to join",
    notTakingNew: "Not taking new people",
    askToJoin: "Ask to join",
    putNameDown: "Put my name down",
    youreWaiting: "You're on the waiting list",
    fullTakingNames: "Full — taking names",
    onePersonWaiting: "1 person waiting",
    peopleWaiting: "{count} people waiting",
    nobodyWaitingList: "Nobody on the waiting list",
    anythingToSay: "Anything to say to the leader?",
    withdraw: "Withdraw",
    leaveGroup: "Leave the group",
    where: "Where",
    nobodyWaiting: "Nobody is waiting",
    onePersonAsked: "1 person has asked to join",
    peopleAsked: "{count} people have asked to join",
    yesComeAlong: "Yes, come along",
    notThisOne: "Not this one",
    yourGroups: "Your groups",
    televisions: "Televisions",
    yourGroupsSubtitle: "Where you meet during the week.",
    notInAGroup: "You're not in a group yet.",
    seeWhatThereIs: "See what there is",
    youLeadThis: "You lead this one.",
  },
} as const;

/**
 * The shape of a language file.
 *
 * Structural rather than a list of keys: a language missing `events.title`
 * fails to compile, and so does one that invents `events.titel`.
 */
export type Messages = {
  [Section in keyof typeof en]: { [Key in keyof (typeof en)[Section]]: string };
};
