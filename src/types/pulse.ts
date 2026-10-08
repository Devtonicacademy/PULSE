export type MomentCategory =
  | 'events'
  | 'alerts'
  | 'food_drinks'
  | 'lost_found'
  | 'recommendations'
  | 'activities'
  | 'deals'
  | 'community';

export type FeedCategoryFilter = MomentCategory | 'all' | 'business_pins';

export type ReactionType =
  | 'helpful'
  | 'trending'
  | 'confirmed'
  | 'interested'
  | 'going';

export interface ReactionCounts {
  helpful: number;
  trending: number;
  confirmed: number;
  interested: number;
  going: number;
}

export interface Moment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  userReputation: number;
  title: string;
  description: string;
  category: MomentCategory;
  latitude: number;
  longitude: number;
  photoUrl?: string;
  createdAt: string; // ISO string
  expiresAt: string; // ISO string
  engagementScore: number;
  viewsCount: number;
  isArchived: boolean;
  isBlurred?: boolean;
  approxAddress: string;
  reactions: ReactionCounts;
  userReaction?: ReactionType;
  commentCount: number;
  distanceKm?: number;
  /** Minutes added to expiresAt by trending / confirmed reactions (from Firestore) */
  bonusMinutes?: number;
  isVerified?: boolean;
  isBusiness?: boolean;
  businessName?: string;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  momentId: string;
  parentId?: string;
  content: string;
  createdAt: string;
  likesCount: number;
  userLiked?: boolean;
  mentions?: string[];
}

export interface ActivityZone {
  id: string;
  zoneName: string;
  activityScore: number; // 0 - 100 Pulse Score
  activeUsers: number;
  momentCount: number;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  summary: string;
}

export interface Business {
  id: string;
  name: string;
  description: string;
  category: string;
  location: string;
  latitude: number;
  longitude: number;
  verified: boolean;
  subscriptionPlan: 'starter' | 'pro' | 'enterprise';
  avatar: string;
  coverImage?: string;
  stats: {
    views: number;
    reach: number;
    clicks: number;
    engagementRate: number;
  };
}

export interface BusinessPost {
  id: string;
  businessId: string;
  businessName: string;
  businessAvatar: string;
  title: string;
  offer: string;
  livePinType: 'Happy Hour' | 'Food Truck' | 'Flash Sale' | 'Limited Offer';
  latitude: number;
  longitude: number;
  createdAt: string;
  expiresAt: string;
  clicks: number;
  views: number;
}

export interface TemporaryCommunity {
  id: string;
  name: string;
  description: string;
  triggerType: 'event' | 'festival' | 'campus' | 'concert';
  momentId?: string;
  centerLat: number;
  centerLng: number;
  activeUntil: string;
  memberCount: number;
  unreadCount?: number;
}

export interface CommunityMessage {
  id: string;
  communityId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  createdAt: string;
}

export type ReputationBadge =
  | 'Local Scout'
  | 'Trailblazer'
  | 'Food Hunter'
  | 'Community Hero'
  | 'Safety Reporter'
  | 'Local Legend';

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatar: string;
  bio: string;
  reputation: number;
  points: number;
  badges: ReputationBadge[];
  isVerifiedBusiness?: boolean;
  createdMomentsCount: number;
  confirmedAlertsCount: number;
  isAnonymous?: boolean;
  providerId?: string;
  createdAt?: string;
}

export type NotificationType =
  | 'trending'
  | 'event'
  | 'alert'
  | 'deal'
  | 'community'
  | 'reward';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  momentId?: string;
  distanceKm?: number;
  createdAt: string;
  isRead: boolean;
  actionUrl?: string;
}

export type RadiusKm = 1 | 2 | 5 | 10 | 25;
