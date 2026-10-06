import {
  Moment,
  ActivityZone,
  Business,
  BusinessPost,
  TemporaryCommunity,
  UserProfile,
  NotificationItem,
  Comment
} from '../types/pulse';

// Reference center coordinates (Victoria Island, Lagos)
export const DEFAULT_COORDS = {
  latitude: 6.4281,
  longitude: 3.4219,
  name: 'Victoria Island, Lagos'
};

export const MOCK_USER: UserProfile = {
  id: 'user-001',
  username: 'chidi_explorer',
  email: 'chidi@pulseapp.io',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
  bio: 'Urban explorer & food enthusiast discovering the city block by block ⚡',
  reputation: 88,
  points: 420,
  badges: ['Local Scout', 'Food Hunter', 'Trailblazer', 'Community Hero'],
  isVerifiedBusiness: false,
  createdMomentsCount: 14,
  confirmedAlertsCount: 9
};

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
const hoursFromNow = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000).toISOString();

export const INITIAL_MOMENTS: Moment[] = [
  {
    id: 'moment-1',
    userId: 'user-101',
    userName: 'Kemi_Lagos',
    userAvatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80',
    userReputation: 92,
    title: 'Food Festival & Artisan Grill at Freedom Park',
    description: 'Over 30 local culinary vendors, live acoustic sets, and smoky suya skewers! Entry is free before 5 PM. Huge crowd gathering near the amphitheater.',
    category: 'food_drinks',
    latitude: 6.4530,
    longitude: 3.3980,
    photoUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
    createdAt: hoursAgo(2),
    expiresAt: hoursFromNow(22),
    engagementScore: 98,
    viewsCount: 1420,
    isArchived: false,
    isBlurred: false,
    approxAddress: 'Freedom Park, Lagos Island',
    reactions: {
      helpful: 42,
      trending: 89,
      confirmed: 35,
      interested: 110,
      going: 64
    },
    userReaction: 'trending',
    commentCount: 28
  },
  {
    id: 'moment-2',
    userId: 'user-102',
    userName: 'DJ_Tunde',
    userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    userReputation: 85,
    title: 'Live Jazz Night & Sunset Rooftop at Sky Lounge',
    description: 'Smooth saxophone solos under the stars overlooking the marina. Happy hour cocktails until 8:30 PM. Rooftop terrace is filling up quick!',
    category: 'events',
    latitude: 6.4312,
    longitude: 3.4290,
    photoUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=800&q=80',
    createdAt: hoursAgo(3),
    expiresAt: hoursFromNow(18),
    engagementScore: 94,
    viewsCount: 1120,
    isArchived: false,
    isBlurred: false,
    approxAddress: 'Sky Lounge, Victoria Island',
    reactions: {
      helpful: 24,
      trending: 68,
      confirmed: 19,
      interested: 85,
      going: 42
    },
    commentCount: 19
  },
  {
    id: 'moment-3',
    userId: 'user-103',
    userName: 'TrafficRadar_NG',
    userAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    userReputation: 96,
    title: 'Heavy Traffic on Ozumba Mbadiwe Expressway',
    description: 'Broken down container truck blocking 2 inbound lanes towards Falomo Bridge. Diversion through Adeola Odeku is recommended. Traffic backed up 1.5km.',
    category: 'alerts',
    latitude: 6.4350,
    longitude: 3.4350,
    photoUrl: 'https://images.unsplash.com/photo-1508974239320-0a029497e820?auto=format&fit=crop&w=800&q=80',
    createdAt: hoursAgo(1),
    expiresAt: hoursFromNow(8),
    engagementScore: 91,
    viewsCount: 2310,
    isArchived: false,
    isBlurred: false,
    approxAddress: 'Ozumba Mbadiwe Ave, Victoria Island',
    reactions: {
      helpful: 112,
      trending: 45,
      confirmed: 82,
      interested: 12,
      going: 4
    },
    userReaction: 'helpful',
    commentCount: 34
  },
  {
    id: 'moment-4',
    userId: 'user-104',
    userName: 'Ngozi_Bites',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
    userReputation: 79,
    title: 'Artisan Coffee Shop Grand Opening: 50% Off First Pour',
    description: 'The Bean Vault just opened on Admiralty Way! Cold brews, single-origin roasts, and free almond croissants for the first 100 visitors today.',
    category: 'deals',
    latitude: 6.4490,
    longitude: 3.4680,
    photoUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80',
    createdAt: hoursAgo(4),
    expiresAt: hoursFromNow(14),
    engagementScore: 86,
    viewsCount: 890,
    isArchived: false,
    isBlurred: false,
    approxAddress: 'Admiralty Way, Lekki Phase 1',
    reactions: {
      helpful: 35,
      trending: 54,
      confirmed: 22,
      interested: 71,
      going: 39
    },
    commentCount: 15
  },
  {
    id: 'moment-5',
    userId: 'user-105',
    userName: 'CampusVibe_Unilag',
    userAvatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&q=80',
    userReputation: 82,
    title: 'Campus Hackathon Demo Day at Faculty of Engineering',
    description: 'Student founders showcasing 15 AI & hardware prototypes right now! Free pizza, investor judges, and live VR demos.',
    category: 'activities',
    latitude: 6.5168,
    longitude: 3.3976,
    photoUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
    createdAt: hoursAgo(2),
    expiresAt: hoursFromNow(12),
    engagementScore: 88,
    viewsCount: 1650,
    isArchived: false,
    isBlurred: false,
    approxAddress: 'University of Lagos, Akoka, Yaba',
    reactions: {
      helpful: 48,
      trending: 77,
      confirmed: 31,
      interested: 92,
      going: 56
    },
    commentCount: 22
  },
  {
    id: 'moment-6',
    userId: 'user-106',
    userName: 'Bayo_Pets',
    userAvatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=200&q=80',
    userReputation: 74,
    title: 'Lost Golden Retriever: Wearing Red Collar near Muri Okunola',
    description: 'Friendly male retriever named "Simba" spotted wandering near the park gates 20 minutes ago. Seems gentle. Please alert the security booth if seen!',
    category: 'lost_found',
    latitude: 6.4310,
    longitude: 3.4200,
    photoUrl: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=800&q=80',
    createdAt: hoursAgo(1),
    expiresAt: hoursFromNow(20),
    engagementScore: 78,
    viewsCount: 740,
    isArchived: false,
    isBlurred: true,
    approxAddress: 'Near Muri Okunola Park, Victoria Island',
    reactions: {
      helpful: 63,
      trending: 21,
      confirmed: 14,
      interested: 18,
      going: 0
    },
    commentCount: 11
  },
  {
    id: 'moment-7',
    userId: 'user-107',
    userName: 'Amina_Reads',
    userAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    userReputation: 89,
    title: 'Community Open Air Book Swap & Vinyl Fair',
    description: 'Bring a book, take a book! Plus vintage African jazz vinyls spinning on portable turntables. Great low-key vibe under the trees.',
    category: 'community',
    latitude: 6.4410,
    longitude: 3.4150,
    photoUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80',
    createdAt: hoursAgo(5),
    expiresAt: hoursFromNow(16),
    engagementScore: 82,
    viewsCount: 620,
    isArchived: false,
    isBlurred: false,
    approxAddress: 'Victoria Island Green Garden',
    reactions: {
      helpful: 39,
      trending: 28,
      confirmed: 17,
      interested: 45,
      going: 25
    },
    commentCount: 8
  },
  {
    id: 'moment-8',
    userId: 'user-108',
    userName: 'Chef_Segun',
    userAvatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80',
    userReputation: 94,
    title: 'Secret Ramen & Bao Bun Pop-up: Only 50 Bowls Left',
    description: 'Slow-cooked 18-hour tonkotsu broth, hand-pulled noodles, and glazed pork belly. When they are gone, we close the shutter!',
    category: 'food_drinks',
    latitude: 6.5050,
    longitude: 3.3760,
    photoUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80',
    createdAt: hoursAgo(2),
    expiresAt: hoursFromNow(6),
    engagementScore: 95,
    viewsCount: 1830,
    isArchived: false,
    isBlurred: false,
    approxAddress: 'Commercial Ave, Yaba',
    reactions: {
      helpful: 52,
      trending: 98,
      confirmed: 43,
      interested: 115,
      going: 72
    },
    userReaction: 'trending',
    commentCount: 31
  }
];

export const INITIAL_ZONES: ActivityZone[] = [
  {
    id: 'zone-1',
    zoneName: 'Victoria Island',
    activityScore: 92,
    activeUsers: 840,
    momentCount: 38,
    centerLat: 6.4281,
    centerLng: 3.4219,
    radiusMeters: 2800,
    summary: 'Hotspot of live dining, nightlife, and waterfront activity. Heavy traffic on bridge connectors.'
  },
  {
    id: 'zone-2',
    zoneName: 'Lekki Phase 1',
    activityScore: 82,
    activeUsers: 620,
    momentCount: 26,
    centerLat: 6.4474,
    centerLng: 3.4730,
    radiusMeters: 3200,
    summary: 'Buzzing cafe corridor along Admiralty Way, pop-up markets, and evening fitness runs.'
  },
  {
    id: 'zone-3',
    zoneName: 'Yaba Tech & Campus Corridor',
    activityScore: 74,
    activeUsers: 510,
    momentCount: 21,
    centerLat: 6.5095,
    centerLng: 3.3711,
    radiusMeters: 2600,
    summary: 'High student energy, hackathons at Unilag, and bustling street food along Commercial Avenue.'
  }
];

export const INITIAL_BUSINESSES: Business[] = [
  {
    id: 'biz-1',
    name: 'Sky Lounge & Bistro',
    description: 'Premier rooftop dining and live performance venue with panoramic lagoon views.',
    category: 'Nightlife & Dining',
    location: '12 Bishop Aboyade Cole, Victoria Island',
    latitude: 6.4312,
    longitude: 3.4290,
    verified: true,
    subscriptionPlan: 'enterprise',
    avatar: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=200&q=80',
    coverImage: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=800&q=80',
    stats: {
      views: 4520,
      reach: 12400,
      clicks: 890,
      engagementRate: 14.2
    }
  },
  {
    id: 'biz-2',
    name: 'The Bean Vault Artisan Cafe',
    description: 'Direct-trade specialty espresso, cold nitro brews, and artisan bakery treats.',
    category: 'Coffee & Cafe',
    location: '44 Admiralty Way, Lekki Phase 1',
    latitude: 6.4490,
    longitude: 3.4680,
    verified: true,
    subscriptionPlan: 'pro',
    avatar: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=200&q=80',
    stats: {
      views: 3120,
      reach: 7800,
      clicks: 640,
      engagementRate: 11.8
    }
  }
];

export const INITIAL_BUSINESS_POSTS: BusinessPost[] = [
  {
    id: 'bpost-1',
    businessId: 'biz-1',
    businessName: 'Sky Lounge & Bistro',
    businessAvatar: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=200&q=80',
    title: 'Sunset Happy Hour: 2-for-1 Cocktails & Tapas',
    offer: 'Show this Live Pin at the bar to receive 2-for-1 signature mixes between 5PM and 8PM today.',
    livePinType: 'Happy Hour',
    latitude: 6.4312,
    longitude: 3.4290,
    createdAt: hoursAgo(1),
    expiresAt: hoursFromNow(6),
    clicks: 142,
    views: 890
  },
  {
    id: 'bpost-2',
    businessId: 'biz-2',
    businessName: 'The Bean Vault Artisan Cafe',
    businessAvatar: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=200&q=80',
    title: 'Flash Sale: 50% Off First Pour & Pastry Box',
    offer: 'Grand opening flash promo valid until 6:00 PM or until supplies last. Mention #PULSERADAR.',
    livePinType: 'Flash Sale',
    latitude: 6.4490,
    longitude: 3.4680,
    createdAt: hoursAgo(3),
    expiresAt: hoursFromNow(5),
    clicks: 98,
    views: 640
  }
];

export const INITIAL_COMMUNITIES: TemporaryCommunity[] = [
  {
    id: 'comm-1',
    name: 'Freedom Park Tonight',
    description: 'Ephemeral hub for everyone attending the outdoor food festival, DJ sets, and night market.',
    triggerType: 'festival',
    momentId: 'moment-1',
    centerLat: 6.4530,
    centerLng: 3.3980,
    activeUntil: hoursFromNow(12),
    memberCount: 318,
    unreadCount: 4
  },
  {
    id: 'comm-2',
    name: 'University of Lagos Today',
    description: 'Active campus chat for students, hackathon attendees, and faculty happenings.',
    triggerType: 'campus',
    momentId: 'moment-5',
    centerLat: 6.5168,
    centerLng: 3.3976,
    activeUntil: hoursFromNow(14),
    memberCount: 540,
    unreadCount: 2
  },
  {
    id: 'comm-3',
    name: 'Ozumba Traffic Updates',
    description: 'Real-time commuter coordination for navigating the broken-down truck congestion.',
    triggerType: 'event',
    momentId: 'moment-3',
    centerLat: 6.4350,
    centerLng: 3.4350,
    activeUntil: hoursFromNow(4),
    memberCount: 195,
    unreadCount: 0
  }
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    type: 'alert',
    title: '🚨 Emergency Alert Nearby',
    message: 'Heavy congestion on Ozumba Mbadiwe Ave due to a broken-down vehicle. Rerouting advised.',
    momentId: 'moment-3',
    distanceKm: 0.8,
    createdAt: hoursAgo(1),
    isRead: false
  },
  {
    id: 'notif-2',
    type: 'trending',
    title: '🔥 Trending Moment Nearby',
    message: 'Food Festival & Artisan Grill at Freedom Park is rapidly gaining reactions (+89 trending)!',
    momentId: 'moment-1',
    distanceKm: 2.1,
    createdAt: hoursAgo(2),
    isRead: false
  },
  {
    id: 'notif-3',
    type: 'deal',
    title: '🍕 Food Deal within 500m',
    message: 'The Bean Vault Artisan Cafe has launched a Flash 50% discount for today only!',
    momentId: 'moment-4',
    distanceKm: 0.4,
    createdAt: hoursAgo(3),
    isRead: true
  },
  {
    id: 'notif-4',
    type: 'event',
    title: '🎉 New Event within 2km',
    message: 'Live Jazz Night & Sunset Rooftop at Sky Lounge starts in less than 2 hours.',
    momentId: 'moment-2',
    distanceKm: 1.2,
    createdAt: hoursAgo(4),
    isRead: true
  }
];

export const INITIAL_COMMENTS: Comment[] = [
  {
    id: 'c-1',
    userId: 'user-201',
    userName: 'Ade_Gourmet',
    userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    momentId: 'moment-1',
    content: 'Are the suya stands already fired up? What is the parking situation like?',
    createdAt: hoursAgo(2),
    likesCount: 7,
    userLiked: true
  },
  {
    id: 'c-2',
    userId: 'user-101',
    userName: 'Kemi_Lagos',
    userAvatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80',
    momentId: 'moment-1',
    parentId: 'c-1',
    content: '@Ade_Gourmet Yes! Suya is sizzling hot. Park near Broad Street multi-level lot, street parking is already full.',
    createdAt: hoursAgo(1),
    likesCount: 14,
    mentions: ['Ade_Gourmet']
  },
  {
    id: 'c-3',
    userId: 'user-202',
    userName: 'Sola_Vibes',
    userAvatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80',
    momentId: 'moment-2',
    content: 'Do they take reservations for the terrace or is it first come first served?',
    createdAt: hoursAgo(2),
    likesCount: 3
  },
  {
    id: 'c-4',
    userId: 'user-203',
    userName: 'LagosDriver_7',
    userAvatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=150&q=80',
    momentId: 'moment-3',
    content: 'Tow truck has just arrived at Ozumba! Police are guiding single-lane passage.',
    createdAt: hoursAgo(0.5),
    likesCount: 19,
    userLiked: true
  }
];
