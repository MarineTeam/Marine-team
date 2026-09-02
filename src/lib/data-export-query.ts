import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { standingIn, canSeeAddress } from "@/lib/groups";
import { EXPORT_FORMAT_VERSION, pushServiceOf } from "@/lib/data-export";

/**
 * Reading a member's whole account out of the database, for
 * `GET /api/profile/export`. The rules this obeys are written down in
 * `data-export.ts`; this file is the part that has to touch Prisma.
 *
 * Every query below is scoped to one `userId`, and every `select` is written
 * out by hand. Neither is decoration: `include: true` on a relation is how a
 * neighbour's phone number ends up in somebody's downloads folder, and a
 * `findMany` that forgets its `where` is how everybody's does.
 */

/** What the file says about one thing the member did. Dates are ISO strings. */
type Iso = string;

const iso = (date: Date | null | undefined): Iso | null => date?.toISOString() ?? null;

export type ExportDocument = Awaited<ReturnType<typeof buildExport>>;

export async function buildExport(user: User, at = new Date()) {
  const userId = user.id;
  const where = { where: { userId } };

  const [
    identities,
    seriesFavorites,
    videoFavorites,
    fileFavorites,
    seriesWatchLater,
    videoWatchLater,
    categoryWatchLater,
    subscriptions,
    ratings,
    reactions,
    watchProgress,
    playlists,
    readingProgress,
    readingMarks,
    sermonNotes,
    outlineAnswers,
    comments,
    commentReports,
  ] = await Promise.all([
    prisma.userIdentity.findMany({
      ...where,
      select: { provider: true, email: true, emailVerified: true, lastLoginAt: true, createdAt: true },
      orderBy: { lastLoginAt: "desc" },
    }),
    prisma.seriesFavorite.findMany({
      ...where,
      select: { createdAt: true, series: { select: { title: true, slug: true } } },
    }),
    prisma.videoFavorite.findMany({
      ...where,
      select: { createdAt: true, video: { select: { title: true } } },
    }),
    prisma.fileFavorite.findMany({
      ...where,
      select: { createdAt: true, file: { select: { title: true } } },
    }),
    prisma.seriesWatchLater.findMany({
      ...where,
      select: { createdAt: true, series: { select: { title: true } } },
    }),
    prisma.videoWatchLater.findMany({
      ...where,
      select: { createdAt: true, video: { select: { title: true } } },
    }),
    prisma.categoryWatchLater.findMany({
      ...where,
      select: { createdAt: true, category: { select: { name: true } } },
    }),
    prisma.subscription.findMany({
      ...where,
      select: {
        muted: true,
        createdAt: true,
        series: { select: { title: true } },
        category: { select: { name: true } },
      },
    }),
    prisma.rating.findMany({
      ...where,
      select: {
        value: true,
        createdAt: true,
        updatedAt: true,
        series: { select: { title: true } },
        video: { select: { title: true } },
      },
    }),
    prisma.reaction.findMany({
      ...where,
      select: {
        type: true,
        createdAt: true,
        series: { select: { title: true } },
        video: { select: { title: true } },
      },
    }),
    prisma.watchProgress.findMany({
      ...where,
      select: { positionSeconds: true, completed: true, updatedAt: true, video: { select: { title: true } } },
    }),
    prisma.playlist.findMany({
      ...where,
      select: {
        title: true,
        public: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: { position: true, createdAt: true, video: { select: { title: true } } },
          orderBy: { position: "asc" },
        },
      },
    }),
    prisma.readingProgress.findMany({
      ...where,
      select: { location: true, percent: true, updatedAt: true, file: { select: { title: true } } },
    }),
    prisma.readingMark.findMany({
      ...where,
      select: {
        kind: true,
        location: true,
        endLocation: true,
        excerpt: true,
        note: true,
        color: true,
        createdAt: true,
        updatedAt: true,
        file: { select: { title: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.sermonNote.findMany({
      ...where,
      select: {
        timestampSeconds: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        video: { select: { title: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.sermonOutlineAnswer.findMany({
      ...where,
      select: { answers: true, outlineVersion: true, updatedAt: true, video: { select: { title: true } } },
    }),
    prisma.comment.findMany({
      ...where,
      select: {
        body: true,
        hidden: true,
        parentId: true,
        createdAt: true,
        series: { select: { title: true } },
        video: { select: { title: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.commentReport.findMany({ ...where, select: { commentId: true, createdAt: true } }),
  ]);

  const [
    teamMemberships,
    assignments,
    blockouts,
    person,
    registrations,
    submissions,
    prayerRequests,
    intercessions,
    groupMemberships,
    notifications,
    broadcasts,
    chatMessages,
    chatMutes,
    pushSubscriptions,
    tvDevices,
    shareLinks,
    permissionGroups,
    categoryEditor,
    seriesEditor,
    seriesViewGrants,
    videoViewGrants,
    downloadGrants,
  ] = await Promise.all([
    prisma.serviceTeamMember.findMany({
      ...where,
      select: { position: true, joinedAt: true, team: { select: { name: true } } },
    }),
    prisma.serviceAssignment.findMany({
      ...where,
      select: {
        position: true,
        status: true,
        note: true,
        respondedAt: true,
        createdAt: true,
        coverWanted: true,
        coverNote: true,
        coveredAt: true,
        team: { select: { name: true } },
        plan: { select: { title: true, serviceDate: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.serviceBlockout.findMany({
      ...where,
      select: { startDate: true, endDate: true, reason: true, createdAt: true },
      orderBy: { startDate: "asc" },
    }),
    prisma.person.findUnique({ where: { userId }, select: { displayName: true, active: true } }),
    prisma.eventRegistration.findMany({
      ...where,
      select: {
        name: true,
        email: true,
        phone: true,
        guests: true,
        note: true,
        status: true,
        promotedAt: true,
        cancelledAt: true,
        createdAt: true,
        event: { select: { title: true, slug: true, startsAt: true, location: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.formSubmission.findMany({
      ...where,
      select: {
        createdAt: true,
        form: { select: { title: true, slug: true } },
        answers: {
          select: { value: true, field: { select: { label: true, position: true } } },
          orderBy: { field: { position: "asc" } },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.prayerRequest.findMany({
      ...where,
      select: {
        name: true,
        body: true,
        anonymous: true,
        visibility: true,
        status: true,
        answeredNote: true,
        answeredAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.prayerIntercession.findMany({ ...where, select: { requestId: true, createdAt: true } }),
    prisma.smallGroupMember.findMany({
      ...where,
      select: {
        role: true,
        status: true,
        note: true,
        respondedAt: true,
        createdAt: true,
        group: { select: { name: true, slug: true, area: true, address: true, meetsWhen: true } },
      },
    }),
    prisma.notification.findMany({
      ...where,
      select: { title: true, body: true, url: true, readAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.broadcastRecipient.findMany({
      ...where,
      select: {
        channel: true,
        address: true,
        status: true,
        sentAt: true,
        broadcast: { select: { subject: true, body: true, sentAt: true } },
      },
      orderBy: { sentAt: "desc" },
    }),
    prisma.liveChatMessage.findMany({
      ...where,
      select: {
        authorName: true,
        body: true,
        hidden: true,
        createdAt: true,
        stream: { select: { title: true, startAt: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.liveChatMute.findMany({
      ...where,
      select: { createdAt: true, stream: { select: { title: true } } },
    }),
    prisma.pushSubscription.findMany({ ...where, select: { endpoint: true, createdAt: true } }),
    prisma.tvDevice.findMany({
      ...where,
      select: {
        deviceName: true,
        deviceKind: true,
        status: true,
        approvedAt: true,
        lastSeenAt: true,
        createdAt: true,
      },
    }),
    prisma.shareLink.findMany({
      where: { createdById: userId },
      select: {
        token: true,
        visibility: true,
        grantsAccess: true,
        note: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
        viewCount: true,
        series: { select: { title: true } },
        video: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.groupAssignment.findMany({
      ...where,
      select: { createdAt: true, group: { select: { name: true } } },
    }),
    prisma.categoryEditor.findMany({ ...where, select: { createdAt: true, category: { select: { name: true } } } }),
    prisma.seriesEditor.findMany({ ...where, select: { createdAt: true, series: { select: { title: true } } } }),
    prisma.seriesViewer.findMany({ ...where, select: { createdAt: true, series: { select: { title: true } } } }),
    prisma.videoViewer.findMany({ ...where, select: { createdAt: true, video: { select: { title: true } } } }),
    prisma.downloadPolicyUser.count({ where: { userId } }),
  ]);

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: at.toISOString(),
    /**
     * What the file is and what it deliberately leaves out, written for the
     * member rather than for a developer — a plain JSON dump with no note like
     * this reads as the whole truth, and this one isn't: it is everything about
     * *them*, which is not the same as everything they can see.
     */
    readMe:
      "Everything Marine Team holds about your account, as of the date above. " +
      "Other people's words are not in here even where they sit next to yours — " +
      "replies to your comments, the text of prayers you prayed for, the names of " +
      "anyone else in your groups or on your rota. Sign-in tokens, push keys and " +
      "password hashes are left out on purpose: they are keys, not facts about you.",

    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      displayName: user.displayName,
      picture: user.picture,
      role: user.role,
      authorized: user.authorized,
      phone: user.phone,
      smsOptIn: user.smsOptIn,
      emailNotifications: user.emailNotifications,
      broadcastEmails: user.broadcastEmails,
      notificationFrequency: user.notificationFrequency,
      joinedAt: iso(user.createdAt),
      updatedAt: iso(user.updatedAt),
      /** The name this account appears under on a rota, when it has one. */
      rotaName: person?.displayName ?? null,
      /**
       * Whether a calendar-feed link exists — not the link itself. The token in
       * it is the whole of that feed's authentication, so it belongs in the
       * settings page that can replace it and nowhere else.
       */
      calendarLinkActive: user.calendarToken !== null,
    },

    signInMethods: identities.map((row) => ({
      provider: row.provider,
      email: row.email,
      emailVerified: row.emailVerified,
      lastSignInAt: iso(row.lastLoginAt),
      firstSeenAt: iso(row.createdAt),
    })),

    library: {
      favorites: [
        ...seriesFavorites.map((row) => ({ kind: "series", title: row.series.title, savedAt: iso(row.createdAt) })),
        ...videoFavorites.map((row) => ({ kind: "video", title: row.video.title, savedAt: iso(row.createdAt) })),
        ...fileFavorites.map((row) => ({ kind: "file", title: row.file.title, savedAt: iso(row.createdAt) })),
      ],
      watchLater: [
        ...seriesWatchLater.map((row) => ({ kind: "series", title: row.series.title, savedAt: iso(row.createdAt) })),
        ...videoWatchLater.map((row) => ({ kind: "video", title: row.video.title, savedAt: iso(row.createdAt) })),
        ...categoryWatchLater.map((row) => ({
          kind: "category",
          title: row.category.name,
          savedAt: iso(row.createdAt),
        })),
      ],
      following: subscriptions.map((row) => ({
        title: row.series?.title ?? row.category?.name ?? null,
        kind: row.series ? "series" : "category",
        muted: row.muted,
        followedAt: iso(row.createdAt),
      })),
      playlists: playlists.map((row) => ({
        title: row.title,
        sharedByLink: row.public,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
        videos: row.items.map((item) => ({
          title: item.video.title,
          position: item.position,
          addedAt: iso(item.createdAt),
        })),
      })),
      ratings: ratings.map((row) => ({
        title: row.series?.title ?? row.video?.title ?? null,
        stars: row.value,
        ratedAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
      reactions: reactions.map((row) => ({
        title: row.series?.title ?? row.video?.title ?? null,
        reaction: row.type,
        reactedAt: iso(row.createdAt),
      })),
      watchHistory: watchProgress.map((row) => ({
        title: row.video.title,
        positionSeconds: row.positionSeconds,
        finished: row.completed,
        lastWatchedAt: iso(row.updatedAt),
      })),
    },

    reading: {
      progress: readingProgress.map((row) => ({
        title: row.file.title,
        location: row.location,
        percent: row.percent,
        updatedAt: iso(row.updatedAt),
      })),
      marks: readingMarks.map((row) => ({
        title: row.file.title,
        kind: row.kind,
        location: row.location,
        endLocation: row.endLocation,
        excerpt: row.excerpt,
        note: row.note,
        color: row.color,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    },

    sermonNotes: sermonNotes.map((row) => ({
      video: row.video.title,
      atSeconds: row.timestampSeconds,
      body: row.body,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    })),

    outlineAnswers: outlineAnswers.map((row) => ({
      video: row.video.title,
      answers: row.answers,
      outlineVersion: row.outlineVersion,
      updatedAt: iso(row.updatedAt),
    })),

    comments: comments.map((row) => ({
      on: row.series?.title ?? row.video?.title ?? null,
      body: row.body,
      /**
       * Whether it was a reply, but not to what: the comment above theirs was
       * written by somebody else, and quoting it here would export a stranger's
       * words under this member's name.
       */
      isReply: row.parentId !== null,
      hiddenByModerator: row.hidden,
      postedAt: iso(row.createdAt),
    })),

    /**
     * Reports the member filed. The reported comment is identified but not
     * quoted — the text belongs to whoever wrote it, and the fact of the report
     * is the part that is this member's.
     */
    commentReports: commentReports.map((row) => ({ commentId: row.commentId, reportedAt: iso(row.createdAt) })),

    serving: {
      teams: teamMemberships.map((row) => ({
        team: row.team.name,
        usualPosition: row.position,
        joinedAt: iso(row.joinedAt),
      })),
      assignments: assignments.map((row) => ({
        service: row.plan.title,
        serviceDate: iso(row.plan.serviceDate),
        team: row.team.name,
        position: row.position,
        answer: row.status,
        note: row.note,
        askedForCover: row.coverWanted,
        coverNote: row.coverNote,
        /** Set when they took this one over from somebody else. */
        tookOverAt: iso(row.coveredAt),
        answeredAt: iso(row.respondedAt),
        askedAt: iso(row.createdAt),
      })),
      unavailable: blockouts.map((row) => ({
        from: iso(row.startDate),
        to: iso(row.endDate),
        reason: row.reason,
        addedAt: iso(row.createdAt),
      })),
    },

    events: registrations.map((row) => ({
      event: row.event.title,
      startsAt: iso(row.event.startsAt),
      location: row.event.location,
      nameGiven: row.name,
      emailGiven: row.email,
      phoneGiven: row.phone,
      guests: row.guests,
      note: row.note,
      status: row.status,
      promotedFromWaitlistAt: iso(row.promotedAt),
      cancelledAt: iso(row.cancelledAt),
      registeredAt: iso(row.createdAt),
    })),

    formSubmissions: submissions.map((row) => ({
      form: row.form.title,
      submittedAt: iso(row.createdAt),
      answers: row.answers.map((answer) => ({ question: answer.field.label, answer: answer.value })),
    })),

    prayer: {
      requests: prayerRequests.map((row) => ({
        nameShown: row.name,
        body: row.body,
        anonymous: row.anonymous,
        visibility: row.visibility,
        status: row.status,
        answeredNote: row.answeredNote,
        answeredAt: iso(row.answeredAt),
        postedAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
      /**
       * Requests they prayed for, by id and date only. Somebody else wrote each
       * of them, and pressing "I prayed for this" is not consent to carry their
       * words away in a file.
       */
      prayedFor: intercessions.map((row) => ({ requestId: row.requestId, prayedAt: iso(row.createdAt) })),
    },

    smallGroups: groupMemberships.map((row) => {
      const standing = standingIn([{ userId, role: row.role, status: row.status }], { userId, manages: false });
      return {
        group: row.group.name,
        meetsWhen: row.group.meetsWhen,
        area: row.group.area,
        // The same rule the group's own page uses (lib/groups.ts): an address
        // is a house somebody lives in, and being on the waiting list is not
        // enough to be told where. Reusing the function rather than repeating
        // the condition is what stops the two drifting apart.
        ...(canSeeAddress(standing, { userId, manages: false }) && row.group.address
          ? { address: row.group.address }
          : {}),
        role: row.role,
        status: row.status,
        note: row.note,
        answeredAt: iso(row.respondedAt),
        askedAt: iso(row.createdAt),
      };
    }),

    messages: {
      notifications: notifications.map((row) => ({
        title: row.title,
        body: row.body,
        url: row.url,
        readAt: iso(row.readAt),
        receivedAt: iso(row.createdAt),
      })),
      announcements: broadcasts.map((row) => ({
        subject: row.broadcast.subject,
        body: row.broadcast.body,
        channel: row.channel,
        sentTo: row.address,
        delivery: row.status,
        sentAt: iso(row.sentAt ?? row.broadcast.sentAt),
      })),
    },

    liveChat: {
      messages: chatMessages.map((row) => ({
        stream: row.stream.title,
        streamStartedAt: iso(row.stream.startAt),
        nameShown: row.authorName,
        body: row.body,
        hiddenByModerator: row.hidden,
        postedAt: iso(row.createdAt),
      })),
      /** Times they were muted in a stream's chat, without naming the moderator. */
      mutes: chatMutes.map((row) => ({ stream: row.stream.title, mutedAt: iso(row.createdAt) })),
    },

    devices: {
      /**
       * Which browsers are signed up for push, named by the push service only.
       * The endpoint's full URL, with the keys beside it, is what lets anybody
       * holding it push to that phone — see `pushServiceOf`.
       */
      push: pushSubscriptions.map((row) => ({
        pushService: pushServiceOf(row.endpoint),
        subscribedAt: iso(row.createdAt),
      })),
      televisions: tvDevices.map((row) => ({
        name: row.deviceName,
        kind: row.deviceKind,
        status: row.status,
        signedInAt: iso(row.approvedAt),
        lastSeenAt: iso(row.lastSeenAt),
        pairedAt: iso(row.createdAt),
      })),
    },

    shareLinks: shareLinks.map((row) => ({
      shared: row.series?.title ?? row.video?.title ?? null,
      url: `/s/${row.token}`,
      visibility: row.visibility,
      grantsAccess: row.grantsAccess,
      note: row.note,
      opened: row.viewCount,
      createdAt: iso(row.createdAt),
      expiresAt: iso(row.expiresAt),
      revokedAt: iso(row.revokedAt),
    })),

    access: {
      permissionGroups: permissionGroups.map((row) => ({ group: row.group.name, addedAt: iso(row.createdAt) })),
      editorOfCategories: categoryEditor.map((row) => ({ category: row.category.name, since: iso(row.createdAt) })),
      editorOfSeries: seriesEditor.map((row) => ({ series: row.series.title, since: iso(row.createdAt) })),
      grantedSeries: seriesViewGrants.map((row) => ({ series: row.series.title, since: iso(row.createdAt) })),
      grantedVideos: videoViewGrants.map((row) => ({ video: row.video.title, since: iso(row.createdAt) })),
      namedInDownloadPolicy: downloadGrants > 0,
    },
  };
}
