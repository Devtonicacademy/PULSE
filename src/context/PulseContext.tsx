import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
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
  subscribeToNearbyMoments,
  subscribeToMyReactions,
  subscribeToActivityZones,
  subscribeToBusinesses,
  subscribeToBusinessPosts,
  fetchUserActivityCounts,
  saveMomentToFirebase,
  setMomentReaction,
  saveCommentToFirebase,
  saveReport,
  checkIsAdmin,
  isNearMoment,
  StoredReaction
} from '../services/firebaseSyncService';
import {
  notificationPermission,
  isAlertNotificationsEnabled,
  enableAlertNotifications,
  disableAlertNotifications,
  showAlertNotification,
  NotificationSupport
} from '../services/alertNotifications';
import { deriveProfileStats } from '../utils/gamification';
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
    /** Where the moment is; defaults to the active hub. Pass the device GPS fix when there is one. */
    location?: { latitude: number; longitude: number };
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
  /** Whether the signed-in user is listed as a moderator (admins collection) */
  isAdmin: boolean;
  /** On-device "new alert near you" notifications (no push server) */
  alertNotifications: {
    permission: NotificationSupport;
    enabled: boolean;
    enable: () => Promise<void>;
    disable: () => void;
  };
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

  // Sign-in survey and the user's 3D avatar (null until the survey is finished)
  surveyAnswers: SurveyAnswers | null;
  avatarConfig: AvatarConfig | null;
  isSurveyOpen: boolean;
  openSurvey: () => void;
  closeSurvey: () => void;
  completeSurvey: (answers: SurveyAnswers, avatar: AvatarConfig) => void;
}

import { AvatarConfig, loadStoredAvatar, storeAvatar } from '../components/avatar/avatarConfig';
import { SurveyAnswers, loadSurvey, storeSurvey } from '../utils/survey';

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

/** A recent device GPS fix, or null when it is unavailable or denied (never prompts twice in a row) */
function getGpsFix(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 5 * 60 * 1000 }
    );
  });
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
  const [surveyAnswers, setSurveyAnswers] = useState<SurveyAnswers | null>(null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const surveyDismissedFor = useRef<Set<string>>(new Set());
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

  // Moments that came from Firestore are re-fetched on load, so only local ones are stored
  const remoteIdsRef = useRef<Set<string>>(new Set());
  const myReactionsRef = useRef<Map<string, StoredReaction> | null>(null);
  const userIdRef = useRef('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationSupport>(() => notificationPermission());
  const [alertNotificationsOn, setAlertNotificationsOn] = useState(() => isAlertNotificationsEnabled());
  const [statsVersion, setStatsVersion] = useState(0);
  const refreshStats = () => setStatsVersion((v) => v + 1);

  // Sync moments & comments to local storage
  useEffect(() => {
    localStorage.setItem(
      'pulse_moments',
      JSON.stringify(moments.filter((m) => !remoteIdsRef.current.has(m.id)))
    );
  }, [moments]);

  useEffect(() => {
    localStorage.setItem('pulse_comments', JSON.stringify(comments));
  }, [comments]);

  // Sync user profile to local storage
  useEffect(() => {
    localStorage.setItem('pulse_user_profile', JSON.stringify(userProfile));
  }, [userProfile]);

  // Sign-in survey: load this user's saved answers and avatar, or ask on their first sign-in
  useEffect(() => {
    const id = userProfile.id;
    const answers = loadSurvey(id);
    const avatar = loadStoredAvatar(id);
    setSurveyAnswers(answers);
    setAvatarConfig(answers ? avatar : null);
    if (!answers && isAuthenticated && !surveyDismissedFor.current.has(id)) setIsSurveyOpen(true);
    if (answers) setRadiusKm(answers.radiusKm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile.id, isAuthenticated]);

  const closeSurvey = () => {
    surveyDismissedFor.current.add(userProfile.id);
    setIsSurveyOpen(false);
  };

  const completeSurvey = (answers: SurveyAnswers, avatar: AvatarConfig) => {
    storeSurvey(userProfile.id, answers);
    storeAvatar(userProfile.id, avatar);
    setSurveyAnswers(answers);
    setAvatarConfig(avatar);
    setRadiusKm(answers.radiusKm);
    setIsSurveyOpen(false);
  };

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

  // 4. Real-time sync via Firebase Firestore (project quizapp-project-c5e0e).
  // Only the moments inside the radius are read (geohash ranges), and the query is redone when the
  // location or radius changes.
  useEffect(() => {
    if (!isFirebaseConfigured) {
      console.log('[PULSE Firebase] Firestore credentials omitted or uninitialized; running with reactive local / demo mode.');
      return;
    }

    const subscribedAt = Date.now();
    const seenIds = new Set<string>();

    const unsubscribe = subscribeToNearbyMoments(currentLocation, radiusKm, (remote) => {
      const mine = myReactionsRef.current;
      const nextRemote = new Map(
        remote.map((m) => [
          m.id,
          mine ? { ...m, userReaction: mine.get(m.id)?.type, userReactionNearby: mine.get(m.id)?.nearby } : m
        ])
      );

      // A brand-new alert inside the radius raises an in-app (and, if enabled, OS) notification.
      // Everything that arrives in the first seconds is the initial load, not news.
      const settling = Date.now() - subscribedAt < 5000;
      remote.forEach((m) => {
        if (seenIds.has(m.id)) return;
        seenIds.add(m.id);
        const fresh = Date.now() - new Date(m.createdAt).getTime() < 15 * 60 * 1000;
        if (settling || !fresh || m.category !== 'alerts' || m.hidden || m.userId === userIdRef.current) return;
        const dist = calculateDistanceKm(currentLocation.latitude, currentLocation.longitude, m.latitude, m.longitude);
        const where = dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
        const notif: NotificationItem = {
          id: `alert-${m.id}`,
          type: 'alert',
          title: `🚨 New alert ${where} from you`,
          message: m.title,
          momentId: m.id,
          distanceKm: dist,
          createdAt: new Date().toISOString(),
          isRead: false
        };
        setNotifications((prev) => (prev.some((n) => n.id === notif.id) ? prev : [notif, ...prev]));
        triggerToast(notif);
        void showAlertNotification({ momentId: m.id, title: 'New alert near you', body: `${m.title} (${where} away)` });
      });
      setMoments((prev) => {
        // Drop moments that left the radius, expired or were deleted; keep local-only ones
        const kept = prev.filter((m) => !remoteIdsRef.current.has(m.id) || nextRemote.has(m.id));
        const byId = new Map(kept.map((m) => [m.id, m]));
        nextRemote.forEach((rm, id) => {
          const existing = byId.get(id);
          byId.set(id, existing ? { ...existing, ...rm } : rm);
        });
        remoteIdsRef.current = new Set(nextRemote.keys());
        return Array.from(byId.values());
      });
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentLocation.latitude, currentLocation.longitude, radiusKm]);

  // 4b. The signed-in user's own reactions, so the UI shows what they picked on any device
  const firebaseUid = currentUser?.uid;
  useEffect(() => {
    myReactionsRef.current = null;
    if (!isFirebaseConfigured || !firebaseUid) {
      setMoments((prev) =>
        prev.some((m) => remoteIdsRef.current.has(m.id) && m.userReaction)
          ? prev.map((m) =>
              remoteIdsRef.current.has(m.id) ? { ...m, userReaction: undefined, userReactionNearby: undefined } : m
            )
          : prev
      );
      return;
    }

    const unsubscribe = subscribeToMyReactions(firebaseUid, (mine) => {
      myReactionsRef.current = mine;
      setMoments((prev) =>
        prev.map((m) =>
          remoteIdsRef.current.has(m.id) &&
          (m.userReaction !== mine.get(m.id)?.type || m.userReactionNearby !== mine.get(m.id)?.nearby)
            ? { ...m, userReaction: mine.get(m.id)?.type, userReactionNearby: mine.get(m.id)?.nearby }
            : m
        )
      );
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [firebaseUid]);

  // 4c. Activity zones and business pins come from Firestore when it has them; the demo seeds stay otherwise
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsubscribers = [
      subscribeToActivityZones(setActivityZones),
      subscribeToBusinesses(setBusinesses),
      subscribeToBusinessPosts(setBusinessPosts)
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
  }, []);

  // 4e. Moderators (admins collection) get the review panel on their profile
  useEffect(() => {
    userIdRef.current = userProfile.id;
    if (!isFirebaseConfigured || !firebaseUid || currentUser?.isAnonymous) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    checkIsAdmin(firebaseUid).then((admin) => {
      if (!cancelled) setIsAdmin(admin);
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseUid, userProfile.id]);

  // 4f. Clicking an OS notification focuses the app; the service worker tells us which moment
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'pulse-open-moment') return;
      setActiveTab('map');
      setMoments((current) => {
        const found = current.find((m) => m.id === event.data.momentId);
        if (found) setSelectedMoment(found);
        return current;
      });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  // 4d. Points, reputation and the moment count are derived from the user's real activity
  useEffect(() => {
    if (!isFirebaseConfigured || !firebaseUid) return;
    let cancelled = false;
    fetchUserActivityCounts(firebaseUid).then((counts) => {
      if (!counts || cancelled) return;
      setUserProfile((prev) =>
        prev.id === firebaseUid
          ? { ...prev, ...deriveProfileStats(counts, currentUser?.isAnonymous) }
          : prev
      );
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseUid, userProfile.id, statsVersion]);

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
    // Moments hidden by reports wait for review; only their author still sees them
    const allCandidateMoments: Moment[] = moments.filter((m) => !m.hidden || m.userId === userProfile.id);

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
  }, [moments, businessPosts, businessReactions, currentLocation, radiusKm, selectedCategory, searchQuery, userProfile.id]);

  const selectedMoment = useMemo(() => {
    if (!selectedMomentRef) return null;
    const id = selectedMomentRef.id;
    const latest = moments.find((m) => m.id === id);
    // A moment hidden by reports closes for everyone but its author
    if (latest?.hidden && latest.userId !== userProfile.id) return null;
    return filteredMoments.find((m) => m.id === id) ?? latest ?? selectedMomentRef;
  }, [selectedMomentRef, filteredMoments, moments, userProfile.id]);

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

  // Signed in to Firebase: server data and derived stats apply; otherwise everything stays local
  const isSynced = Boolean(isFirebaseConfigured && currentUser);

  // Moment actions
  const addMoment = (data: {
    location?: { latitude: number; longitude: number };
    title: string;
    description: string;
    category: MomentCategory;
    photoUrl?: string;
    lifespanHours: number;
    blurPrivacy: boolean;
  }): Moment => {
    let lat = data.location?.latitude ?? currentLocation.latitude;
    let lng = data.location?.longitude ?? currentLocation.longitude;

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
        helpful: 0,
        trending: 0,
        confirmed: 0,
        interested: 0,
        going: 0
      },
      commentCount: 0
    };

    setMoments((prev) => [newMoment, ...prev]);

    // Posted from a GPS fix outside the current radius: move the map there so the author sees it
    if (
      data.location &&
      calculateDistanceKm(currentLocation.latitude, currentLocation.longitude, lat, lng) > radiusKm
    ) {
      const areaName = getApproximateAreaName(data.location.latitude, data.location.longitude);
      setCurrentLocation({
        latitude: data.location.latitude,
        longitude: data.location.longitude,
        name: areaName !== 'Local Area' ? areaName : 'My Live GPS'
      });
    }

    // Save to Firebase Firestore if configured (quizapp-project-c5e0e)
    if (isFirebaseConfigured) {
      saveMomentToFirebase(newMoment).then((result) => {
        if (result.ok) {
          refreshStats();
        } else if (result.reason !== 'offline') {
          triggerToast({
            id: `notif-post-${Date.now()}`,
            type: 'alert',
            title: 'Saved on this device only',
            message:
              result.reason === 'denied'
                ? 'You can post one moment every 2 minutes. Wait a moment and try again to broadcast it live.'
                : 'Could not reach the live map. Your moment is saved on this device.',
            createdAt: new Date().toISOString(),
            isRead: false
          });
        }
      });
    }

    // Local demo profiles earn points on the spot; signed-in users' points come from their real activity
    if (!isSynced) {
      setUserProfile((prev) => ({
        ...prev,
        points: prev.points + 15,
        reputation: Math.min(100, prev.reputation + 2),
        createdMomentsCount: prev.createdMomentsCount + 1
      }));
    }

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

    // Local demo profiles earn points on the spot; signed-in users' points come from their real activity
    if (!isSynced) {
      setUserProfile((prev) => ({
        ...prev,
        points: prev.points + 2
      }));
    }

    // One reaction per user: tapping your current one removes it, another one switches to it.
    // Only moments that live in Firestore are synced (demo moments are local).
    if (isSynced && remoteIdsRef.current.has(momentId)) {
      const current = moments.find((m) => m.id === momentId);
      const previous: StoredReaction | undefined = current?.userReaction
        ? { type: current.userReaction, nearby: Boolean(current.userReactionNearby) }
        : undefined;
      const next = previous?.type === reactionType ? undefined : reactionType;
      void (async () => {
        // Confirming an alert counts as "nearby" only with a real GPS fix close to it
        const position = next === 'confirmed' ? await getGpsFix() : null;
        const ok = await setMomentReaction(momentId, previous, next, {
          currentBonusMinutes: current?.bonusMinutes ?? 0,
          position,
          moment: current
        });
        if (ok) refreshStats();
      })();
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

    if (!isSynced) {
      setUserProfile((prev) => ({
        ...prev,
        points: prev.points + 5
      }));
    }

    // Sync comment to Firebase Firestore (only on moments that live there)
    if (isSynced && remoteIdsRef.current.has(momentId)) {
      saveCommentToFirebase(newComment).then((ok) => {
        if (ok) refreshStats();
      });
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
    const toast = (title: string, message: string) =>
      triggerToast({
        id: `report-${Date.now()}`,
        type: 'alert',
        title,
        message,
        createdAt: new Date().toISOString(),
        isRead: false
      });

    // Demo moments and local-only sessions have no server to report to
    if (!isSynced || !remoteIdsRef.current.has(momentId)) {
      toast('🛡️ Report Received', 'Thank you for keeping Pulse safe. This demo moment is local, so nothing was sent.');
      return;
    }

    void saveReport(momentId, reason, notes).then((result) => {
      if (result.ok) {
        toast(
          '🛡️ Report Received',
          result.hidden
            ? 'Thanks. Enough people reported this moment that it is now hidden until a moderator reviews it.'
            : 'Thank you for keeping Pulse safe. A moderator will review it if others report it too.'
        );
      } else if (result.reason === 'guest') {
        toast('Sign in to report', 'Reports come from signed-in accounts so they cannot be spammed. Sign in or create an account first.');
        setIsAuthModalOpen(true);
      } else if (result.reason === 'denied') {
        toast('Could not send the report', 'You may have already reported this moment, or it is your own.');
      } else {
        toast('Could not send the report', 'Check your connection and try again.');
      }
    });
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
        isAdmin,
        alertNotifications: {
          permission: notifPermission,
          enabled: alertNotificationsOn && notifPermission === 'granted',
          enable: async () => {
            const result = await enableAlertNotifications();
            setNotifPermission(result);
            setAlertNotificationsOn(result === 'granted');
          },
          disable: () => {
            disableAlertNotifications();
            setAlertNotificationsOn(false);
          }
        },
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
        updateUserProfile,
        surveyAnswers,
        avatarConfig,
        isSurveyOpen,
        openSurvey: () => setIsSurveyOpen(true),
        closeSurvey,
        completeSurvey
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
