import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  Moment,
  MomentCategory,
  FeedCategoryFilter,
  ReactionType,
  ActivityZone,
  Business,
  BusinessPost,
  TemporaryCommunity,
  UserProfile,
  NotificationItem,
  Comment,
  RadiusKm
} from '../types/pulse';
import {
  DEFAULT_COORDS,
  MOCK_USER,
  INITIAL_MOMENTS,
  INITIAL_ZONES,
  INITIAL_BUSINESSES,
  INITIAL_BUSINESS_POSTS,
  INITIAL_COMMUNITIES,
  INITIAL_NOTIFICATIONS,
  INITIAL_COMMENTS
} from '../services/mockData';
import { calculateDistanceKm, isWithinRadius, applyPrivacyBlur, getApproximateAreaName } from '../utils/geoUtils';
import { isFirebaseConfigured } from '../services/firebaseClient';
import {
  subscribeToFirebaseMoments,
  saveMomentToFirebase,
  updateFirebaseReaction,
  saveCommentToFirebase
} from '../services/firebaseSyncService';
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signInAsGuest,
  signOutUser,
  subscribeToAuthState,
  updateUserProfileInFirestore,
  formatAuthErrorMessage
} from '../services/firebaseAuthService';
import { User } from 'firebase/auth';
import confetti from 'canvas-confetti';

interface PulseContextType {
  // Location & Radius
  currentLocation: { latitude: number; longitude: number; name: string };
  setCurrentLocation: (loc: { latitude: number; longitude: number; name: string }) => void;
  radiusKm: RadiusKm;
  setRadiusKm: (radius: RadiusKm) => void;
  useBrowserLocation: () => void;
  isLocating: boolean;

  // Active Tab & Selection
  activeTab: 'map' | 'discover' | 'create' | 'notifications' | 'profile';
  setActiveTab: (tab: 'map' | 'discover' | 'create' | 'notifications' | 'profile') => void;
  selectedCategory: FeedCategoryFilter;
  setSelectedCategory: (cat: FeedCategoryFilter) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedMoment: Moment | null;
  setSelectedMoment: (m: Moment | null) => void;
  selectedZone: ActivityZone | null;
  setSelectedZone: (z: ActivityZone | null) => void;

  // Data
  moments: Moment[];
  filteredMoments: Moment[];
  activityZones: ActivityZone[];
  businesses: Business[];
  businessPosts: BusinessPost[];
  temporaryCommunities: TemporaryCommunity[];
  notifications: NotificationItem[];
  userProfile: UserProfile;
  comments: Comment[];
  isBusinessMode: boolean;
  setIsBusinessMode: (val: boolean) => void;
  isFirebaseConfigured: boolean;

  // Current area Pulse Score
  currentPulseScore: number;
  currentZoneName: string;

  // Actions
  addMoment: (data: {
    title: string;
    description: string;
    category: MomentCategory;
    photoUrl?: string;
    lifespanHours: number;
    blurPrivacy: boolean;
  }) => Moment;
  toggleReaction: (momentId: string, reactionType: ReactionType) => void;
  addComment: (momentId: string, content: string, parentId?: string) => Comment;
  toggleCommentLike: (commentId: string) => void;
  reportMoment: (momentId: string, reason: string, notes?: string) => void;
  addBusinessPost: (post: {
    title: string;
    offer: string;
    livePinType: 'Happy Hour' | 'Food Truck' | 'Flash Sale' | 'Limited Offer';
    durationHours: number;
  }) => BusinessPost;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  dismissToast: () => void;
  activeToast: NotificationItem | null;
  simulateIncomingMomentAlert: () => void;

  // Auth State & Actions (Firebase)
  currentUser: User | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, username?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (profileData: Partial<UserProfile>) => Promise<void>;
}

const PulseContext = createContext<PulseContextType | undefined>(undefined);

type ReactionState = Pick<Moment, 'reactions' | 'userReaction'>;

const DEFAULT_BUSINESS_REACTIONS: Moment['reactions'] = {
  helpful: 24,
  trending: 48,
  confirmed: 19,
  interested: 62,
  going: 29
};

// Business live pins are shown alongside moments as verified "deals"
function businessPostToMoment(bp: BusinessPost, reactionState?: ReactionState): Moment {
  return {
    id: bp.id,
    userId: bp.businessId,
    userName: bp.businessName,
    userAvatar: bp.businessAvatar,
    userReputation: 99,
    title: `${bp.livePinType}: ${bp.title}`,
    description: bp.offer,
    category: 'deals',
    latitude: bp.latitude,
    longitude: bp.longitude,
    createdAt: bp.createdAt,
    expiresAt: bp.expiresAt,
    engagementScore: 92,
    viewsCount: bp.views,
    isArchived: false,
    approxAddress: `${bp.businessName} (Verified Partner)`,
    reactions: reactionState?.reactions ?? DEFAULT_BUSINESS_REACTIONS,
    userReaction: reactionState?.userReaction,
    commentCount: 6,
    isBusiness: true,
    businessName: bp.businessName
  };
}

// Tapping your current reaction removes it; tapping another one switches to it
function applyReactionToggle(m: Moment, reactionType: ReactionType): Moment {
  const newReactions = { ...m.reactions };

  if (m.userReaction === reactionType) {
    newReactions[reactionType] = Math.max(0, newReactions[reactionType] - 1);
    return {
      ...m,
      reactions: newReactions,
      userReaction: undefined,
      engagementScore: Math.max(10, m.engagementScore - 2)
    };
  }

  // If had another reaction previously, decrement that one
  if (m.userReaction) {
    newReactions[m.userReaction] = Math.max(0, newReactions[m.userReaction] - 1);
  }
  newReactions[reactionType] = newReactions[reactionType] + 1;

  // Extend expiration slightly for highly trending moments (Feature 4)
  let newExpiresAt = m.expiresAt;
  if (reactionType === 'trending' || reactionType === 'confirmed') {
    const currentExp = new Date(m.expiresAt).getTime();
    newExpiresAt = new Date(currentExp + 30 * 60 * 1000).toISOString(); // +30 mins bonus
  }

  return {
    ...m,
    reactions: newReactions,
    userReaction: reactionType,
    expiresAt: newExpiresAt,
    engagementScore: Math.min(100, m.engagementScore + 4)
  };
}

export const PulseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Location state
  const [currentLocation, setCurrentLocation] = useState(DEFAULT_COORDS);
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(5);
  const [isLocating, setIsLocating] = useState(false);

  // 2. Navigation & filter state
  const [activeTab, setActiveTab] = useState<'map' | 'discover' | 'create' | 'notifications' | 'profile'>('map');
  const [selectedCategory, setSelectedCategory] = useState<FeedCategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Keep the picked moment as a reference only; the live copy is resolved below so
  // reactions/comments made while it is open show up immediately
  const [selectedMomentRef, setSelectedMoment] = useState<Moment | null>(null);
  const [selectedZone, setSelectedZone] = useState<ActivityZone | null>(null);

  // 3. Domain states
  const [moments, setMoments] = useState<Moment[]>(() => {
    const saved = localStorage.getItem('pulse_moments');
    if (!saved) return INITIAL_MOMENTS;
    // Seed moments are demo content timed relative to page load; re-time them on every
    // load so returning visitors don't get a permanently empty map once they expire.
    // User-created moments keep their real expiry.
    const freshSeeds = new Map(INITIAL_MOMENTS.map((m) => [m.id, m]));
    return (JSON.parse(saved) as Moment[]).map((m) => {
      const seed = freshSeeds.get(m.id);
      return seed ? { ...m, createdAt: seed.createdAt, expiresAt: seed.expiresAt } : m;
    });
  });

  const [comments, setComments] = useState<Comment[]>(() => {
    const saved = localStorage.getItem('pulse_comments');
    return saved ? JSON.parse(saved) : INITIAL_COMMENTS;
  });

  const [activityZones, setActivityZones] = useState<ActivityZone[]>(INITIAL_ZONES);
  const [businesses, setBusinesses] = useState<Business[]>(INITIAL_BUSINESSES);
  const [businessPosts, setBusinessPosts] = useState<BusinessPost[]>(INITIAL_BUSINESS_POSTS);
  // Business pins aren't in `moments` (or Firestore), so their reactions are tracked locally here
  const [businessReactions, setBusinessReactions] = useState<Record<string, ReactionState>>({});
  const [temporaryCommunities, setTemporaryCommunities] = useState<TemporaryCommunity[]>(INITIAL_COMMUNITIES);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  // Auth & Profile state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('pulse_user_profile');
    return saved ? JSON.parse(saved) : MOCK_USER;
  });
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isBusinessMode, setIsBusinessMode] = useState(false);
  const [activeToast, setActiveToast] = useState<NotificationItem | null>(null);

  // Computed authentication status
  const isAuthenticated = useMemo(() => {
    if (currentUser) {
      return !currentUser.isAnonymous;
    }
    return Boolean(
      userProfile &&
      !userProfile.isAnonymous &&
      userProfile.email &&
      userProfile.email !== 'guest@pulseapp.io'
    );
  }, [currentUser, userProfile]);

  // Sync moments & comments to local storage
  useEffect(() => {
    localStorage.setItem('pulse_moments', JSON.stringify(moments));
  }, [moments]);

  useEffect(() => {
    localStorage.setItem('pulse_comments', JSON.stringify(comments));
  }, [comments]);

  // Sync user profile to local storage
  useEffect(() => {
    localStorage.setItem('pulse_user_profile', JSON.stringify(userProfile));
  }, [userProfile]);

  // 3b. Firebase Auth State Listener
  useEffect(() => {
    const unsubscribe = subscribeToAuthState((fbUser, profile) => {
      setCurrentUser(fbUser);
      if (profile) {
        setUserProfile(profile);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // 4. Real-Time Sync via Firebase Firestore (Project: quizapp-project-c5e0e)
  useEffect(() => {
    if (!isFirebaseConfigured) {
      console.log('[PULSE Firebase] Firestore credentials omitted or uninitialized; running with reactive local / demo mode.');
      return;
    }

    console.log('[PULSE Firebase] Subscribing to live Firestore moments (quizapp-project-c5e0e)');
    const unsubscribe = subscribeToFirebaseMoments((liveMoments) => {
      setMoments((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        liveMoments.forEach((lm) => {
          const existing = map.get(lm.id);
          map.set(lm.id, existing ? { ...existing, ...lm } : lm);
        });
        return Array.from(map.values());
      });
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Request browser geolocation if user desires
  const useBrowserLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const areaName = getApproximateAreaName(latitude, longitude);
        setCurrentLocation({
          latitude,
          longitude,
          name: areaName !== 'Local Area' ? areaName : 'My Live GPS'
        });
        setIsLocating(false);
      },
      (err) => {
        console.info('[PULSE] GPS unavailable or timed out; maintaining active hub:', err.message);
        setIsLocating(false);
      },
      { timeout: 6000, enableHighAccuracy: false, maximumAge: 60000 }
    );
  };

  // Filter moments by expiration and radius
  const filteredMoments = useMemo(() => {
    const now = new Date().getTime();

    // Combine active moments and business posts so verified pins can appear in feed
    const allCandidateMoments: Moment[] = [...moments];

    businessPosts.forEach((bp) => {
      if (!allCandidateMoments.some((m) => m.id === bp.id)) {
        allCandidateMoments.push(businessPostToMoment(bp, businessReactions[bp.id]));
      }
    });

    return allCandidateMoments
      .map((m) => {
        const dist = calculateDistanceKm(
          currentLocation.latitude,
          currentLocation.longitude,
          m.latitude,
          m.longitude
        );
        return { ...m, distanceKm: dist };
      })
      .filter((m) => {
        // Expiration check
        const isExpired = new Date(m.expiresAt).getTime() <= now;
        if (m.isArchived || isExpired) return false;

        // Radius check
        if ((m.distanceKm ?? 999) > radiusKm) return false;

        // Category & Verified Business Pins filter
        if (selectedCategory === 'business_pins') {
          if (!m.isBusiness) return false;
        } else if (selectedCategory !== 'all' && m.category !== selectedCategory) {
          return false;
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = m.title.toLowerCase().includes(q);
          const matchDesc = m.description.toLowerCase().includes(q);
          const matchAddr = m.approxAddress.toLowerCase().includes(q);
          const matchBiz = m.businessName?.toLowerCase().includes(q);
          if (!matchTitle && !matchDesc && !matchAddr && !matchBiz) return false;
        }

        return true;
      })
      .sort((a, b) => b.engagementScore - a.engagementScore);
  }, [moments, businessPosts, businessReactions, currentLocation, radiusKm, selectedCategory, searchQuery]);

  const selectedMoment = useMemo(() => {
    if (!selectedMomentRef) return null;
    const id = selectedMomentRef.id;
    return (
      filteredMoments.find((m) => m.id === id) ??
      moments.find((m) => m.id === id) ??
      selectedMomentRef
    );
  }, [selectedMomentRef, filteredMoments, moments]);

  // Calculate current Pulse Score and zone
  const { currentPulseScore, currentZoneName } = useMemo(() => {
    // Find closest zone
    let closestZone: ActivityZone | null = null;
    let minDistance = Infinity;

    for (const zone of activityZones) {
      const dist = calculateDistanceKm(
        currentLocation.latitude,
        currentLocation.longitude,
        zone.centerLat,
        zone.centerLng
      );
      if (dist < minDistance) {
        minDistance = dist;
        closestZone = zone;
      }
    }

    // Dynamic formula based on filtered moments
    const momentsCount = filteredMoments.length;
    const totalReactions = filteredMoments.reduce(
      (acc, m) =>
        acc +
        m.reactions.helpful +
        m.reactions.trending +
        m.reactions.confirmed +
        m.reactions.interested +
        m.reactions.going,
      0
    );

    // Score between 25 and 99
    const rawScore = 30 + momentsCount * 7 + Math.floor(totalReactions / 15);
    const score = Math.min(99, Math.max(25, rawScore));

    return {
      currentPulseScore: closestZone ? closestZone.activityScore : score,
      currentZoneName: closestZone ? closestZone.zoneName : currentLocation.name
    };
  }, [currentLocation, activityZones, filteredMoments]);

  // Toast notification helper
  const triggerToast = (item: NotificationItem) => {
    setActiveToast(item);
    setTimeout(() => {
      setActiveToast((prev) => (prev?.id === item.id ? null : prev));
    }, 6000);
  };

  const dismissToast = () => setActiveToast(null);

  // Moment actions
  const addMoment = (data: {
    title: string;
    description: string;
    category: MomentCategory;
    photoUrl?: string;
    lifespanHours: number;
    blurPrivacy: boolean;
  }): Moment => {
    let lat = currentLocation.latitude;
    let lng = currentLocation.longitude;

    // Feature 13: Privacy Blurring
    if (data.blurPrivacy) {
      const blurred = applyPrivacyBlur(lat, lng, 200);
      lat = blurred.lat;
      lng = blurred.lng;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + data.lifespanHours * 60 * 60 * 1000).toISOString();

    const newMoment: Moment = {
      id: `moment-${Date.now()}`,
      userId: userProfile.id,
      userName: userProfile.username,
      userAvatar: userProfile.avatar,
      userReputation: userProfile.reputation,
      title: data.title,
      description: data.description,
      category: data.category,
      latitude: lat,
      longitude: lng,
      photoUrl:
        data.photoUrl ||
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
      createdAt: now.toISOString(),
      expiresAt,
      engagementScore: 50,
      viewsCount: 1,
      isArchived: false,
      isBlurred: data.blurPrivacy,
      approxAddress: `${getApproximateAreaName(lat, lng)} (near ${currentLocation.name})`,
      reactions: {
        helpful: 1,
        trending: 1,
        confirmed: 0,
        interested: 0,
        going: 0
      },
      commentCount: 0
    };

    setMoments((prev) => [newMoment, ...prev]);

    // Save to Firebase Firestore if configured (quizapp-project-c5e0e)
    if (isFirebaseConfigured) {
      saveMomentToFirebase(newMoment).catch((err) =>
        console.warn('[PULSE Firebase] Error saving moment to Firestore:', err)
      );
    }

    // Reward user with gamification reputation points
    setUserProfile((prev) => ({
      ...prev,
      points: prev.points + 15,
      reputation: Math.min(100, prev.reputation + 2),
      createdMomentsCount: prev.createdMomentsCount + 1
    }));

    // Trigger celebration confetti
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 }
      });
    } catch {
      // safe fallback
    }

    // Add in-app notification
    const notif: NotificationItem = {
      id: `notif-${Date.now()}`,
      type: 'event',
      title: '🎉 Moment Live!',
      message: `Your Moment "${newMoment.title}" is now broadcasting to everyone within ${radiusKm}km.`,
      momentId: newMoment.id,
      distanceKm: 0,
      createdAt: new Date().toISOString(),
      isRead: false
    };
    setNotifications((prev) => [notif, ...prev]);
    triggerToast(notif);

    return newMoment;
  };

  const toggleReaction = (momentId: string, reactionType: ReactionType) => {
    const businessPost = moments.some((m) => m.id === momentId)
      ? undefined
      : businessPosts.find((bp) => bp.id === momentId);

    if (businessPost) {
      setBusinessReactions((prev) => {
        const next = applyReactionToggle(businessPostToMoment(businessPost, prev[momentId]), reactionType);
        return { ...prev, [momentId]: { reactions: next.reactions, userReaction: next.userReaction } };
      });
    } else {
      setMoments((prev) => prev.map((m) => (m.id === momentId ? applyReactionToggle(m, reactionType) : m)));
    }

    // Reward points
    setUserProfile((prev) => ({
      ...prev,
      points: prev.points + 2
    }));

    // Sync to Firebase Firestore if configured. Mirror the local transition exactly:
    // switching reactions must also decrement the previous one.
    if (isFirebaseConfigured && !businessPost) {
      const previous = moments.find((m) => m.id === momentId)?.userReaction;
      const deltas: [ReactionType, number][] =
        previous === reactionType
          ? [[reactionType, -1]]
          : previous
          ? [[previous, -1], [reactionType, 1]]
          : [[reactionType, 1]];
      deltas.forEach(([type, delta]) =>
        updateFirebaseReaction(momentId, type, delta).catch((err) =>
          console.warn('[PULSE Firebase] Error syncing reaction to Firestore:', err)
        )
      );
    }
  };

  const addComment = (momentId: string, content: string, parentId?: string): Comment => {
    const newComment: Comment = {
      id: `comment-${Date.now()}`,
      userId: userProfile.id,
      userName: userProfile.username,
      userAvatar: userProfile.avatar,
      momentId,
      parentId,
      content,
      createdAt: new Date().toISOString(),
      likesCount: 0,
      userLiked: false
    };

    setComments((prev) => [...prev, newComment]);

    // Update moment comment count and engagement score
    setMoments((prev) =>
      prev.map((m) =>
        m.id === momentId
          ? {
              ...m,
              commentCount: m.commentCount + 1,
              engagementScore: Math.min(100, m.engagementScore + 5)
            }
          : m
      )
    );

    setUserProfile((prev) => ({
      ...prev,
      points: prev.points + 5
    }));

    // Sync comment to Firebase Firestore if configured
    if (isFirebaseConfigured) {
      saveCommentToFirebase(newComment).catch((err) =>
        console.warn('[PULSE Firebase] Error saving comment to Firestore:', err)
      );
    }

    return newComment;
  };

  const toggleCommentLike = (commentId: string) => {
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const liked = !c.userLiked;
        return {
          ...c,
          userLiked: liked,
          likesCount: liked ? c.likesCount + 1 : Math.max(0, c.likesCount - 1)
        };
      })
    );
  };

  const reportMoment = (momentId: string, reason: string, notes?: string) => {
    console.log(`[PULSE Trust & Safety] Moment ${momentId} reported for ${reason}: ${notes || ''}`);
    const notif: NotificationItem = {
      id: `report-${Date.now()}`,
      type: 'alert',
      title: '🛡️ Report Received',
      message: 'Thank you for keeping Pulse safe. Our automated moderators are reviewing this moment.',
      createdAt: new Date().toISOString(),
      isRead: false
    };
    triggerToast(notif);
  };

  const addBusinessPost = (post: {
    title: string;
    offer: string;
    livePinType: 'Happy Hour' | 'Food Truck' | 'Flash Sale' | 'Limited Offer';
    durationHours: number;
  }): BusinessPost => {
    const biz = businesses[0];
    const newBPost: BusinessPost = {
      id: `bpost-${Date.now()}`,
      businessId: biz.id,
      businessName: biz.name,
      businessAvatar: biz.avatar,
      title: post.title,
      offer: post.offer,
      livePinType: post.livePinType,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + post.durationHours * 3600 * 1000).toISOString(),
      clicks: 0,
      views: 1
    };

    setBusinessPosts((prev) => [newBPost, ...prev]);

    const notif: NotificationItem = {
      id: `notif-biz-${Date.now()}`,
      type: 'deal',
      title: `⚡ Live Pin Broadcasting: ${post.title}`,
      message: `${biz.name}'s ${post.livePinType} is now highlighted on the Live Map!`,
      createdAt: new Date().toISOString(),
      isRead: false
    };
    setNotifications((prev) => [notif, ...prev]);
    triggerToast(notif);

    return newBPost;
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const simulateIncomingMomentAlert = () => {
    const sampleScenarios = [
      {
        title: '⚡ Secret Rooftop Acoustic Jam at Falomo Marina',
        description: 'Underground indie artists playing acoustic sets under warm string lights. Intimate crowd, craft cider available.',
        category: 'events' as MomentCategory,
        offsetLat: 0.003,
        offsetLng: 0.004,
        photoUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=800&q=80'
      },
      {
        title: '🚨 Rapid Road Repair & Detour on Adeola Odeku',
        description: 'Utility crews working on fiber optic cables. Single lane open, slow down when approaching.',
        category: 'alerts' as MomentCategory,
        offsetLat: -0.002,
        offsetLng: 0.003,
        photoUrl: 'https://images.unsplash.com/photo-1508974239320-0a029497e820?auto=format&fit=crop&w=800&q=80'
      },
      {
        title: '🍔 Pop-up Artisan Smash Burger Stand near Mall',
        description: 'Double wagyu smash patties, caramelized shallot jam, crispy rosemary fries. Open for the next 3 hours only!',
        category: 'food_drinks' as MomentCategory,
        offsetLat: 0.002,
        offsetLng: -0.003,
        photoUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80'
      }
    ];

    const scenario = sampleScenarios[Math.floor(Math.random() * sampleScenarios.length)];
    const mLat = currentLocation.latitude + scenario.offsetLat;
    const mLng = currentLocation.longitude + scenario.offsetLng;
    const dist = calculateDistanceKm(currentLocation.latitude, currentLocation.longitude, mLat, mLng);

    const newSimMoment: Moment = {
      id: `sim-moment-${Date.now()}`,
      userId: 'scout-peer-404',
      userName: 'Peer_Scout_' + Math.floor(100 + Math.random() * 900),
      userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      userReputation: 91,
      title: scenario.title,
      description: scenario.description,
      category: scenario.category,
      latitude: mLat,
      longitude: mLng,
      photoUrl: scenario.photoUrl,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      engagementScore: 78,
      viewsCount: 14,
      isArchived: false,
      approxAddress: `Near ${currentLocation.name}`,
      reactions: { helpful: 3, trending: 8, confirmed: 2, interested: 12, going: 5 },
      commentCount: 2
    };

    setMoments((prev) => [newSimMoment, ...prev]);

    const alertNotif: NotificationItem = {
      id: `sim-ws-${Date.now()}`,
      type: scenario.category === 'alerts' ? 'alert' : 'trending',
      title: `⚡ Real-Time Broadcast (${dist < 1 ? Math.round(dist * 1000) + 'm' : dist.toFixed(1) + 'km'})`,
      message: `${scenario.title} just broadcasted live nearby!`,
      momentId: newSimMoment.id,
      distanceKm: dist,
      createdAt: new Date().toISOString(),
      isRead: false
    };
    setNotifications((prev) => [alertNotif, ...prev]);
    triggerToast(alertNotif);
  };

  // Auth Action Handlers
  const clearAuthError = () => setAuthError(null);

  const loginWithEmail = async (email: string, pass: string) => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const profile = await signInWithEmail(email, pass);
      setUserProfile(profile);
      const notif: NotificationItem = {
        id: `auth-${Date.now()}`,
        type: 'reward',
        title: '👋 Welcome back!',
        message: `Signed in as @${profile.username}. Your Pulse radar is synchronized.`,
        createdAt: new Date().toISOString(),
        isRead: false
      };
      setNotifications((prev) => [notif, ...prev]);
      triggerToast(notif);
    } catch (err: any) {
      const msg = formatAuthErrorMessage(err);
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const registerWithEmail = async (email: string, pass: string, username?: string) => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const profile = await signUpWithEmail(email, pass, username);
      setUserProfile(profile);
      const notif: NotificationItem = {
        id: `auth-${Date.now()}`,
        type: 'reward',
        title: '🎉 Welcome to Pulse!',
        message: `Your Scout profile @${profile.username} is now verified and active.`,
        createdAt: new Date().toISOString(),
        isRead: false
      };
      setNotifications((prev) => [notif, ...prev]);
      triggerToast(notif);
    } catch (err: any) {
      const msg = formatAuthErrorMessage(err);
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const profile = await signInWithGoogle();
      setUserProfile(profile);
      const notif: NotificationItem = {
        id: `auth-${Date.now()}`,
        type: 'reward',
        title: '🌟 Google Verified',
        message: `Logged in as @${profile.username}. Welcome to your live city radar!`,
        createdAt: new Date().toISOString(),
        isRead: false
      };
      setNotifications((prev) => [notif, ...prev]);
      triggerToast(notif);
    } catch (err: any) {
      const msg = formatAuthErrorMessage(err);
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const loginAsGuest = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const profile = await signInAsGuest();
      setUserProfile(profile);
      const notif: NotificationItem = {
        id: `auth-${Date.now()}`,
        type: 'event',
        title: '⚡ Guest Scout Active',
        message: `Exploring as @${profile.username}. You can link an email account anytime.`,
        createdAt: new Date().toISOString(),
        isRead: false
      };
      setNotifications((prev) => [notif, ...prev]);
      triggerToast(notif);
    } catch (err: any) {
      const msg = formatAuthErrorMessage(err);
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logout = async () => {
    setIsAuthLoading(true);
    try {
      await signOutUser();
      const guest = await signInAsGuest();
      setUserProfile(guest);
      const notif: NotificationItem = {
        id: `auth-${Date.now()}`,
        type: 'alert',
        title: '👋 Signed Out',
        message: 'You are now exploring as a guest scout.',
        createdAt: new Date().toISOString(),
        isRead: false
      };
      setNotifications((prev) => [notif, ...prev]);
      triggerToast(notif);
    } catch (err) {
      console.warn('Sign out error:', err);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const updateUserProfile = async (profileData: Partial<UserProfile>) => {
    const updated = { ...userProfile, ...profileData };
    setUserProfile(updated);
    await updateUserProfileInFirestore(updated);
  };

  return (
    <PulseContext.Provider
      value={{
        currentLocation,
        setCurrentLocation,
        radiusKm,
        setRadiusKm,
        useBrowserLocation,
        isLocating,
        activeTab,
        setActiveTab,
        selectedCategory,
        setSelectedCategory,
        searchQuery,
        setSearchQuery,
        selectedMoment,
        setSelectedMoment,
        selectedZone,
        setSelectedZone,
        moments,
        filteredMoments,
        activityZones,
        businesses,
        businessPosts,
        temporaryCommunities,
        notifications,
        userProfile,
        comments,
        isBusinessMode,
        setIsBusinessMode,
        isFirebaseConfigured,
        currentPulseScore,
        currentZoneName,
        addMoment,
        toggleReaction,
        addComment,
        toggleCommentLike,
        reportMoment,
        addBusinessPost,
        markNotificationRead,
        markAllNotificationsRead,
        dismissToast,
        activeToast,
        simulateIncomingMomentAlert,

        // Auth
        currentUser,
        isAuthenticated,
        isAuthLoading,
        authError,
        clearAuthError,
        isAuthModalOpen,
        setIsAuthModalOpen,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        loginAsGuest,
        logout,
        updateUserProfile
      }}
    >
      {children}
    </PulseContext.Provider>
  );
};

export const usePulse = () => {
  const context = useContext(PulseContext);
  if (!context) {
    throw new Error('usePulse must be used within a PulseProvider');
  }
  return context;
};
