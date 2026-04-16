import type { BookingRequest, CreatorProfile, Message, SupporterProfile, Thread, User } from './types';

export const users: User[] = [
  {
    id: 'creator-1',
    name: 'CreatorStudio',
    role: 'creator',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCUXy0CKqQIQekKEtdnBqLo1gYyKaPkTpk_s5osZm_zha1fNB6HFuw8Q6YxljXJRARL3b-v8GHUbQ2UTgqfW3jiGBw0dlJG5XdbblSaCtjW73UL87PGQO-m053fJLtiqiwoubgQDc8QDKxezJRqIgBiufZ9K2SvuopLYDEqEQgCYIL8yrdN_-Q-7h5UEY35ALZ35-z4aEauAfdS7WiRZKBIhFfe9mcUjovu6nOYTM6X4GzXNEIPcQ-TrZFdlJFGQoIMtz3sl9hb9b4',
    accentColor: '#003f87',
    presence: 'online'
  },
  {
    id: 'supporter-1',
    name: 'Sarah Chen',
    role: 'supporter',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAG8nswaMe4J8hKsgIfz2bN1MpYj0tPrdJMV10KOprGepDcRpB1F63VYT-1FZHhVlj0oTBpdXerPy8vyTnRwtbuV33O3vMNbORWZTGf94cE_iVUGiXYGfu-2y-02KFtIDSrYZPXeMa4oCdFCkGs4YOpqtcMzv_d2-dekJxeJaJhAVnY3BORxzPiksnyoImtMBbv8Ygigs5rXfWBd15jdOSUDKA9qmeUd_jj_nBIi7yKrIL3zvycwvIVJ5az1OjqBqZf4dg1F0ENIyc',
    accentColor: '#115cb9',
    presence: 'online'
  },
  {
    id: 'supporter-2',
    name: 'Marcus Thorne',
    role: 'supporter',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBb6P7rsGiV64emHtL2HV3veAcY5jwt-cYe7Bp4z6rWcHjmArjOA7PrNZa4Nf6K-HUq5BMQUIy7xFAqgiplinkgme05KIKdip3pnvfhW64FQdiByaDVRI1Q7vIs6pzJ1ruQbJb9jLm8_ajHX2k0BOAHDnrWQ1H_AzIn2dXRryYsigRvo2zxigfv-32vWIoKSauADwb8p6YXo3ddkNQLbGenFWq1iA3D53764XggilQi0PBsXxd5KxOcoMnrgA1i50GTcq7bS3MXw9o',
    accentColor: '#4c5e84',
    presence: 'away'
  },
  {
    id: 'supporter-3',
    name: 'Elena Rodriguez',
    role: 'supporter',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC4twi9qjQ40iZQKYJgYXwh_h_2Nk89ocoNiHH8XFWWLyspU3oBCg6Qv2hFJGpRodKsPuAybl2LUjYXav56JCBPCUnYGJGApnIgtWBuwlbvJTSPfud_zK3d3pYr1Aol8DVI4n8ZIbkPFFTQJ_hM_7rOKJ5nr21R3lK3dU2fgFrPp35-l8WuEDtsrGl5vaLvYw27BaG-D3kgXcw4wpsDHgAemzuOYOqNODFp-jXrln4OkbgS8ahqiKrt54cbffGi45794lAHwY_-Cbg',
    accentColor: '#a14f5d',
    presence: 'offline'
  },
  {
    id: 'supporter-4',
    name: 'Julian Vane',
    role: 'supporter',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuATRzBQnO2YHP6Ag2rDMqKiZ00zt9argIvMO203BAZdVRHK-EH-PyLLrjY-c4Wk15XZySYINXxawukYBKexF-xRBitjlJ19GAkkUAAvPlcroKSZ1IMhhldoE6HohhkCY9_pgbrmjc_p33Bfh_9c6MB4x6dVpXGP40pl2z0DMI12rFMSby4YW0-Oea_N_bzhjktgP0oFSTNyeRy92v00trDq0gc2vj3_eWeFUEWkXdckN-ZEeIuubzv58k1ieqS757CtNUUmWA7vs4w',
    accentColor: '#7b5cdb',
    presence: 'online'
  },
  {
    id: 'supporter-5',
    name: 'TechNexus Agency',
    role: 'supporter',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDl1W0z7jIUtMu2kz5UPKmwO5avF7Zm0bdjEjrOFzDXxV-7pLG2HV7bNTJkYl33TG_sKrQWsXuMOlRtqNkWPBqig-nS20KNNZpmupg1PxEkJ0u2MfyZEFornNbNFUMHTP3-umFcZhpWgVyQ0SFklXcEp9cRZh7wgQZcQP9r1S-M72oMwHJ9JQ_9KTo7UgsuvyCmsg8WdZJJC-iFzYn420QKS6PULcofcqQpfzq6btGc_hWJX0UAYpGVjJMubQRjpeciOg-uvbc_pQ0',
    accentColor: '#2f7a66',
    presence: 'offline'
  }
];

export const creatorProfiles: CreatorProfile[] = [
  {
    userId: 'creator-1',
    niche: 'Fitness',
    headline: 'Professional creator messaging for qualified supporters and clients.',
    dmAccess: 'subscriber_only'
  }
];

export const supporterProfiles: SupporterProfile[] = [
  { userId: 'supporter-1', accessLevel: 'vip', totalSpend: 1240 },
  { userId: 'supporter-2', accessLevel: 'paid', totalSpend: 520 },
  { userId: 'supporter-3', accessLevel: 'subscriber', totalSpend: 119 },
  { userId: 'supporter-4', accessLevel: 'vip', totalSpend: 940 },
  { userId: 'supporter-5', accessLevel: 'paid', totalSpend: 1800 }
];

export const threads: Thread[] = [
  {
    id: 'thread-1',
    creatorId: 'creator-1',
    supporterId: 'supporter-1',
    accessLevel: 'vip',
    status: 'active',
    subject: 'Creator collaboration',
    lastMessagePreview: 'That lighting setup looks incredible! Would love to collab on the next shoot.',
    lastMessageAt: '2026-04-16T15:58:00.000Z',
    lastMessageLabel: '2m ago',
    unread: true
  },
  {
    id: 'thread-2',
    creatorId: 'creator-1',
    supporterId: 'supporter-2',
    accessLevel: 'paid',
    status: 'active',
    subject: 'Brand partnership contract',
    lastMessagePreview: "I've sent over the contract for the brand partnership. Let me know if you need any adjustments.",
    lastMessageAt: '2026-04-16T15:00:00.000Z',
    lastMessageLabel: '1h ago',
    unread: false
  },
  {
    id: 'thread-3',
    creatorId: 'creator-1',
    supporterId: 'supporter-3',
    accessLevel: 'subscriber',
    status: 'active',
    subject: 'Performance feedback',
    lastMessagePreview: 'The metrics on your last reel were insane. Keep it up!',
    lastMessageAt: '2026-04-16T12:00:00.000Z',
    lastMessageLabel: '4h ago',
    unread: false
  },
  {
    id: 'thread-4',
    creatorId: 'creator-1',
    supporterId: 'supporter-4',
    accessLevel: 'vip',
    status: 'active',
    subject: 'Algorithm strategy',
    lastMessagePreview: 'Did you see the new algorithm update notes? We need to pivot the strategy.',
    lastMessageAt: '2026-04-16T10:00:00.000Z',
    lastMessageLabel: '6h ago',
    unread: true
  },
  {
    id: 'thread-5',
    creatorId: 'creator-1',
    supporterId: 'supporter-5',
    accessLevel: 'paid',
    status: 'active',
    subject: 'CES speaking invitation',
    lastMessagePreview: "We're finalizing the list for the CES invitees. Are you available for travel?",
    lastMessageAt: '2026-04-15T16:15:00.000Z',
    lastMessageLabel: 'Yesterday',
    unread: false
  }
];

export const messages: Message[] = [
  {
    id: 'message-1',
    threadId: 'thread-1',
    senderId: 'supporter-1',
    text: 'That lighting setup looks incredible! What brand of panels are you using for the softbox?',
    createdAt: '2026-04-16T10:42:00.000Z'
  },
  {
    id: 'message-2',
    threadId: 'thread-1',
    senderId: 'creator-1',
    text: "Thanks Sarah! I'm actually using the new Aputure 600d Pro series with a Light Dome II.",
    createdAt: '2026-04-16T10:45:00.000Z'
  },
  {
    id: 'message-3',
    threadId: 'thread-1',
    senderId: 'supporter-1',
    text: "Nice! Thinking of upgrading. How's the color accuracy for video?",
    createdAt: '2026-04-16T10:48:00.000Z'
  },
  {
    id: 'message-4',
    threadId: 'thread-1',
    senderId: 'creator-1',
    text: "It's been really solid so far. Skin tones are easier to grade and the output feels much more consistent on camera.",
    createdAt: '2026-04-16T10:51:00.000Z'
  },
  {
    id: 'message-5',
    threadId: 'thread-2',
    senderId: 'supporter-2',
    text: "I've sent over the contract for the brand partnership. Let me know if you need any adjustments.",
    createdAt: '2026-04-16T14:00:00.000Z'
  },
  {
    id: 'message-6',
    threadId: 'thread-2',
    senderId: 'creator-1',
    text: "Got it. I'll review the deliverables and send notes before end of day.",
    createdAt: '2026-04-16T14:09:00.000Z'
  },
  {
    id: 'message-7',
    threadId: 'thread-3',
    senderId: 'supporter-3',
    text: 'The metrics on your last reel were insane. Keep it up!',
    createdAt: '2026-04-16T12:00:00.000Z'
  },
  {
    id: 'message-8',
    threadId: 'thread-3',
    senderId: 'creator-1',
    text: 'Appreciate it. I am testing a tighter hook and shorter edit pacing on the next batch too.',
    createdAt: '2026-04-16T12:14:00.000Z'
  },
  {
    id: 'message-9',
    threadId: 'thread-4',
    senderId: 'supporter-4',
    text: 'Did you see the new algorithm update notes? We need to pivot the strategy.',
    createdAt: '2026-04-16T09:58:00.000Z'
  },
  {
    id: 'message-10',
    threadId: 'thread-4',
    senderId: 'creator-1',
    text: "Yes. Let's shift the content mix toward saves and shares for the next two weeks and watch retention closely.",
    createdAt: '2026-04-16T10:06:00.000Z'
  },
  {
    id: 'message-11',
    threadId: 'thread-5',
    senderId: 'supporter-5',
    text: "We're finalizing the list for the CES invitees. Are you available for travel?",
    createdAt: '2026-04-15T16:15:00.000Z'
  },
  {
    id: 'message-12',
    threadId: 'thread-5',
    senderId: 'creator-1',
    text: 'Yes, as long as travel and lodging are handled. Send the tentative itinerary and I can confirm today.',
    createdAt: '2026-04-15T16:28:00.000Z'
  }
];

export const bookingRequests: BookingRequest[] = [
  {
    id: 'booking-1',
    creatorId: 'creator-1',
    supporterId: 'supporter-1',
    type: 'Consultation',
    requestedAt: '2026-04-16T09:00:00.000Z',
    note: 'Discuss 8-week transformation plan.'
  }
];
