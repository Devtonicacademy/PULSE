import type {
  ActivityZone,
  Business,
  BusinessPost,
  Comment,
  Moment,
  MomentCategory,
  ReactionCounts,
  TemporaryCommunity
} from '../types/pulse';

/**
 * Extra demo content spread across Lagos, for testing the map, the feed, routes and the 3D view away from
 * the original Victoria Island / Lekki / Yaba cluster. Everything here is made up. Ids start with `seed-`,
 * times are relative to page load (like the other demo data), and the places are real so that routes, 3D
 * tiles and labels have streets to work with.
 *
 * Areas covered: Victoria Island, Ikoyi, Obalende, Onikan, Lagos Island, Eko Atlantic, Oniru, Lekki Phase 1,
 * Ikate, Lekki Conservation Centre, Ajah, Yaba, Ojuelegba, UNILAG, Surulere, Maryland, Ikeja, Oshodi,
 * Apapa, Festac and Mile 12.
 */

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
const hoursFromNow = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000).toISOString();

const unsplash = (id: string, w = 800) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
const PHOTO = {
  food: unsplash('1555396273-367ea4eb4db5'),
  music: unsplash('1511192336575-5a79af67a629'),
  coffee: unsplash('1501339847302-ac426a4a7cbb'),
  night: unsplash('1514525253161-7a46d19cd819'),
  traffic: unsplash('1508974239320-0a029497e820')
};

const PEOPLE = [
  { id: 'seed-user-1', name: 'Tobi_Ikeja', avatar: unsplash('1517841905240-472988babdf9', 200), rep: 81 },
  { id: 'seed-user-2', name: 'Nneka_Surulere', avatar: unsplash('1570295999919-56ceb5ecca61', 200), rep: 74 },
  { id: 'seed-user-3', name: 'Femi_Mainland', avatar: unsplash('1507003211169-0a1dd7228f2d', 200), rep: 88 },
  { id: 'seed-user-4', name: 'Zainab_Lekki', avatar: unsplash('1535713875002-d1d0cf377fde', 200), rep: 90 },
  { id: 'seed-user-5', name: 'Emeka_Apapa', avatar: unsplash('1527980965255-d3b416303d12', 200), rep: 67 },
  { id: 'seed-user-6', name: 'Bisi_Island', avatar: unsplash('1534528741775-53994a69daeb', 200), rep: 93 }
];

interface SeedMoment {
  n: number;
  person: number;
  category: MomentCategory;
  title: string;
  description: string;
  area: string;
  lat: number;
  lng: number;
  photo?: string;
  ageHours: number;
  leftHours: number;
  reactions: Partial<ReactionCounts>;
  views?: number;
  comments?: number;
  verified?: boolean;
  business?: string;
  blurred?: boolean;
}

const moment = (s: SeedMoment): Moment => {
  const person = PEOPLE[s.person % PEOPLE.length];
  const reactions: ReactionCounts = { helpful: 0, trending: 0, confirmed: 0, interested: 0, going: 0, ...s.reactions };
  return {
    id: `seed-moment-${s.n}`,
    userId: person.id,
    userName: person.name,
    userAvatar: person.avatar,
    userReputation: person.rep,
    title: s.title,
    description: s.description,
    category: s.category,
    latitude: s.lat,
    longitude: s.lng,
    photoUrl: s.photo,
    createdAt: hoursAgo(s.ageHours),
    expiresAt: hoursFromNow(s.leftHours),
    engagementScore: Math.min(99, 30 + Math.round(Object.values(reactions).reduce((a, b) => a + b, 0) / 3)),
    viewsCount: s.views ?? 200 + s.n * 37,
    isArchived: false,
    isBlurred: s.blurred ?? false,
    approxAddress: s.area,
    reactions,
    commentCount: s.comments ?? 0,
    isVerified: s.verified,
    isBusiness: Boolean(s.business),
    businessName: s.business
  };
};

export const LAGOS_TEST_MOMENTS: Moment[] = [
  // ---- Victoria Island, Ikoyi, Lagos Island, Eko Atlantic ------------------------------------------
  moment({ n: 1, person: 5, category: 'activities', title: 'Sunset Yoga on the Bar Beach Front', description: 'Free open-air session on the promenade, mats provided for the first 20. Bring water. Beginners welcome.', area: 'Bar Beach, Victoria Island', lat: 6.4262, lng: 3.4168, photo: undefined, ageHours: 1, leftHours: 5, reactions: { interested: 46, going: 22, trending: 18 }, comments: 5 }),
  moment({ n: 2, person: 3, category: 'events', title: 'Eko Atlantic Skyline Night Market', description: 'Street food, local designers and a live band on the new waterfront boulevard. Shuttle from the Ahmadu Bello Way gate every 15 minutes.', area: 'Eko Atlantic City', lat: 6.4125, lng: 3.402, photo: PHOTO.night, ageHours: 3, leftHours: 20, reactions: { trending: 77, interested: 120, going: 58 }, views: 2310, comments: 12, verified: true }),
  moment({ n: 3, person: 0, category: 'lost_found', title: 'Found: Black Wallet Near Adeola Odeku', description: 'Left on a table at a cafe, has a student ID and a bus card inside. Handed to the front desk, message me to claim it.', area: 'Adeola Odeku Street, Victoria Island', lat: 6.429, lng: 3.4238, ageHours: 4, leftHours: 20, reactions: { helpful: 12, confirmed: 3 }, comments: 2 }),
  moment({ n: 4, person: 4, category: 'alerts', title: 'Accident at Falomo Roundabout', description: 'Two cars blocking the inner lane heading to Ikoyi. Traffic officers on site, expect 20-minute delays. Use Awolowo Road.', area: 'Falomo Roundabout, Ikoyi', lat: 6.4437, lng: 3.4287, ageHours: 0.4, leftHours: 1.5, reactions: { helpful: 31, confirmed: 24, trending: 40 }, views: 980, comments: 9, verified: true }),
  moment({ n: 5, person: 1, category: 'food_drinks', title: 'Obalende Suya Spot Is Fired Up', description: 'Beef and ram suya with extra yaji, the queue is moving fast. Cash or transfer. Best at this hour, the smoke is perfect.', area: 'Obalende, Lagos Island', lat: 6.451, lng: 3.4042, photo: PHOTO.food, ageHours: 1.5, leftHours: 10, reactions: { trending: 52, helpful: 20, interested: 40 }, views: 1500, comments: 7 }),
  moment({ n: 6, person: 5, category: 'events', title: 'Classical Evening at the MUSON Centre', description: 'The city orchestra plays an all-Nigerian programme in the main hall. Doors at 6:30 PM, tickets at the box office.', area: 'MUSON Centre, Onikan', lat: 6.4455, lng: 3.4025, photo: PHOTO.music, ageHours: 5, leftHours: 9, reactions: { interested: 64, going: 31, trending: 12 }, comments: 4, verified: true }),
  moment({ n: 7, person: 2, category: 'deals', title: 'Balogun Market Ankara Bundle Sale', description: 'Three yards of Ankara for the price of two at the main entrance stalls today only. Bargaining still welcome.', area: 'Balogun Market, Lagos Island', lat: 6.4538, lng: 3.3908, ageHours: 2, leftHours: 8, reactions: { trending: 35, helpful: 15, interested: 28 }, views: 1210, comments: 6 }),
  moment({ n: 8, person: 3, category: 'community', title: 'Tinubu Square Clean-up Drive', description: 'Volunteers gathering with gloves and sacks. Local council supplies bags and refreshments. All ages welcome.', area: 'Tinubu Square, Lagos Island', lat: 6.4492, lng: 3.3915, ageHours: 1, leftHours: 7, reactions: { going: 40, helpful: 22, interested: 30 }, comments: 3 }),

  // ---- Lekki corridor ------------------------------------------------------------------------------
  moment({ n: 9, person: 3, category: 'events', title: 'Landmark Beach Weekend Food Fair', description: 'Grills, cocktails and kids\' sandcastle contests on the sand. Entry is free, parking is tight so come by ride-share.', area: 'Oniru, Victoria Island', lat: 6.427, lng: 3.446, photo: PHOTO.food, ageHours: 2, leftHours: 18, reactions: { trending: 95, interested: 150, going: 88 }, views: 3120, comments: 15, verified: true }),
  moment({ n: 10, person: 3, category: 'recommendations', title: 'Hidden Amala Spot Off Fola Osibo Road', description: 'Soft amala, gbegiri and ewedu with big goat meat. Small buka, no sign. Look for the green gate. Under ₦2,500 a plate.', area: 'Fola Osibo Road, Lekki Phase 1', lat: 6.4452, lng: 3.4655, ageHours: 6, leftHours: 18, reactions: { helpful: 44, trending: 26 }, comments: 8 }),
  moment({ n: 11, person: 4, category: 'alerts', title: 'Flooding on Admiralty Way After Rain', description: 'Water is knee-deep near the roundabout, small cars are stalling. Take the Lekki-Epe Expressway service lane for now.', area: 'Admiralty Way, Lekki Phase 1', lat: 6.4468, lng: 3.471, ageHours: 0.6, leftHours: 2.5, reactions: { helpful: 27, confirmed: 19, trending: 33 }, views: 860, comments: 6, verified: true }),
  moment({ n: 12, person: 3, category: 'activities', title: 'Canopy Walk at Lekki Conservation Centre', description: 'Guided walk across the longest canopy walkway in Africa. Last entry is at 4 PM. Wear flat shoes, bring mosquito repellent.', area: 'Lekki Conservation Centre', lat: 6.4375, lng: 3.539, ageHours: 3, leftHours: 12, reactions: { interested: 38, going: 16, helpful: 9 }, comments: 3 }),
  moment({ n: 13, person: 4, category: 'alerts', title: 'Standstill Traffic at Ajah Roundabout', description: 'Heavy build-up towards Sangotedo from the toll plaza. Two lanes are closed for repairs. Expect an hour of delay.', area: 'Ajah Roundabout', lat: 6.4682, lng: 3.5852, photo: PHOTO.traffic, ageHours: 0.8, leftHours: 3, reactions: { helpful: 36, confirmed: 28, trending: 45 }, views: 1320, comments: 11 }),
  moment({ n: 14, person: 3, category: 'lost_found', title: 'Lost: Car Keys With Red Tag Near Ikate', description: 'Dropped between the arch and the filling station. Toyota key with a red leather tag. A small reward is offered.', area: 'Ikate, Lekki', lat: 6.444, lng: 3.48, ageHours: 3, leftHours: 21, reactions: { helpful: 14, confirmed: 2 }, comments: 4 }),

  // ---- Mainland: Yaba, Ojuelegba, UNILAG, Surulere -----------------------------------------------
  moment({ n: 15, person: 2, category: 'deals', title: 'Tejuosho Market Phone Accessories Blowout', description: 'Chargers, cables and cases at wholesale prices this afternoon. Test before you pay. Ask for the stall with the blue sign.', area: 'Tejuosho Market, Yaba', lat: 6.5007, lng: 3.3707, ageHours: 2, leftHours: 6, reactions: { trending: 41, helpful: 18, interested: 35 }, comments: 5 }),
  moment({ n: 16, person: 2, category: 'events', title: 'Open Tech Meetup at the Yaba Hub', description: 'Lightning talks on mobile money, logistics and AI tools, followed by networking. Pizza after 7 PM.', area: 'Herbert Macaulay Way, Yaba', lat: 6.5086, lng: 3.3715, ageHours: 4, leftHours: 10, reactions: { interested: 58, going: 33 }, comments: 6, verified: true }),
  moment({ n: 17, person: 2, category: 'alerts', title: 'Ojuelegba Flyover Closed for Repairs', description: 'The ramp towards Surulere is blocked until 8 PM. Danfo drivers are rerouting through Ikorodu Road.', area: 'Ojuelegba, Surulere', lat: 6.5072, lng: 3.3647, ageHours: 1, leftHours: 4, reactions: { helpful: 22, confirmed: 17, trending: 20 }, comments: 4 }),
  moment({ n: 18, person: 0, category: 'activities', title: 'Sunrise Run Along the UNILAG Lagoon Front', description: 'Easy 5K for all paces, starting at the lagoon gate. Water and bananas at the finish. Reflective vests are handed out.', area: 'Lagoon Front, University of Lagos', lat: 6.519, lng: 3.401, ageHours: 5, leftHours: 11, reactions: { going: 36, interested: 44, helpful: 8 }, comments: 3 }),
  moment({ n: 19, person: 1, category: 'food_drinks', title: 'Adeniran Ogunsanya Street Food Crawl', description: 'Pepper soup, grilled corn, puff-puff and chilled zobo from the vendors along the strip. Gets busy after 6 PM.', area: 'Adeniran Ogunsanya Street, Surulere', lat: 6.4958, lng: 3.356, photo: PHOTO.night, ageHours: 2, leftHours: 14, reactions: { trending: 48, interested: 52, helpful: 11 }, views: 1480, comments: 9 }),
  moment({ n: 20, person: 1, category: 'activities', title: 'Neighbourhood Five-a-side at Teslim Balogun', description: 'Pick-up football on the outer pitch, two spots left per team. Bring bibs if you have them.', area: 'Teslim Balogun Stadium, Surulere', lat: 6.5006, lng: 3.3598, ageHours: 1, leftHours: 6, reactions: { going: 18, interested: 22 }, comments: 2 }),

  // ---- Ikeja, Maryland, Oshodi, Mile 12 ------------------------------------------------------------
  moment({ n: 21, person: 0, category: 'deals', title: 'Computer Village Weekend Laptop Fair', description: 'Refurbished and brand-new laptops with a seven-day warranty. Official receipts, test every unit at the counter.', area: 'Otigba Street, Computer Village, Ikeja', lat: 6.5959, lng: 3.3436, photo: undefined, ageHours: 3, leftHours: 20, reactions: { trending: 63, helpful: 25, interested: 70 }, views: 1960, comments: 10 }),
  moment({ n: 22, person: 0, category: 'food_drinks', title: 'Allen Avenue Late-Night Grill Row', description: 'Grilled fish, plantain and peppered snail until 2 AM. Valet at the gate, music is loud but the food is worth it.', area: 'Allen Avenue, Ikeja', lat: 6.601, lng: 3.3515, photo: PHOTO.food, ageHours: 1, leftHours: 11, reactions: { trending: 57, interested: 61, going: 20 }, comments: 7 }),
  moment({ n: 23, person: 0, category: 'events', title: 'Film Premiere Night at Ikeja City Mall', description: 'Red carpet and a Q&A with the cast of a new local release before the first screening. Free popcorn for early arrivals.', area: 'Ikeja City Mall, Alausa', lat: 6.6137, lng: 3.3573, ageHours: 3, leftHours: 7, reactions: { interested: 49, going: 27, trending: 14 }, comments: 4, verified: true }),
  moment({ n: 24, person: 2, category: 'alerts', title: 'Roadworks Slowing Maryland Inbound', description: 'One lane open near the bus stop, expect slow movement towards Ikeja. Okada riders are using the service road.', area: 'Maryland, Ikeja', lat: 6.5667, lng: 3.362, ageHours: 1.5, leftHours: 5, reactions: { helpful: 18, confirmed: 12 }, comments: 3 }),
  moment({ n: 25, person: 4, category: 'alerts', title: 'Pedestrian Bridge Blocked at Oshodi', description: 'Traders have spilled onto the walkway, use the south stairs and take care with bags. Task force is on the way.', area: 'Oshodi Interchange', lat: 6.555, lng: 3.343, ageHours: 0.7, leftHours: 3, reactions: { helpful: 21, confirmed: 14, trending: 11 }, comments: 5 }),
  moment({ n: 26, person: 2, category: 'recommendations', title: 'Fresh Produce at Mile 12 Market', description: 'Tomatoes, peppers and yams at the best prices in the city, best before 8 AM. Bring your own bag and small notes.', area: 'Mile 12 Market, Kosofe', lat: 6.5986, lng: 3.3993, ageHours: 7, leftHours: 17, reactions: { helpful: 33, trending: 16 }, comments: 4 }),

  // ---- Apapa, Festac -------------------------------------------------------------------------------
  moment({ n: 27, person: 4, category: 'alerts', title: 'Truck Queue on the Apapa Access Road', description: 'The line is about two kilometres long towards the port gate. Cars are being diverted along Creek Road. Allow plenty of time.', area: 'Apapa', lat: 6.4478, lng: 3.3622, photo: PHOTO.traffic, ageHours: 2, leftHours: 6, reactions: { helpful: 30, confirmed: 23, trending: 25 }, views: 1050, comments: 8 }),
  moment({ n: 28, person: 4, category: 'community', title: 'Festac Town Street Clean-up and Football Day', description: 'Residents are clearing the drains on 2nd Avenue, followed by a friendly match on the green. Drinks provided.', area: 'Festac Town', lat: 6.4667, lng: 3.2833, ageHours: 4, leftHours: 20, reactions: { going: 34, helpful: 19, interested: 27 }, comments: 5 }),

  // ---- A moment hiding its exact spot and one about to expire ------------------------------------
  moment({ n: 29, person: 5, category: 'recommendations', title: 'Quiet Rooftop Cafe With Lagoon Views', description: 'Great wifi, strong cold brew and almost no crowd before noon. Location is approximate on purpose, ask the host for the entrance.', area: 'Ikoyi (approximate)', lat: 6.4513, lng: 3.4332, photo: PHOTO.coffee, ageHours: 5, leftHours: 19, reactions: { helpful: 29, trending: 13 }, comments: 3, blurred: true }),
  moment({ n: 30, person: 5, category: 'events', title: 'Last Call: Pop-up Vinyl Swap at the Lekki Arts Hub', description: 'The final hour of a one-day swap meet. Bring records to trade or cash to buy. Wraps up soon.', area: 'Lekki Phase 1', lat: 6.4439, lng: 3.4614, photo: PHOTO.music, ageHours: 9, leftHours: 0.3, reactions: { interested: 20, going: 12 }, comments: 2 })
];

export const LAGOS_TEST_ZONES: ActivityZone[] = [
  { id: 'seed-zone-1', zoneName: 'Ikoyi & Obalende', activityScore: 79, activeUsers: 470, momentCount: 19, centerLat: 6.4470, centerLng: 3.4180, radiusMeters: 2600, summary: 'Cafes, suya queues at Obalende and heavy evening traffic through Falomo.' },
  { id: 'seed-zone-2', zoneName: 'Surulere', activityScore: 71, activeUsers: 390, momentCount: 16, centerLat: 6.4990, centerLng: 3.3580, radiusMeters: 2800, summary: 'Match-day crowds near the stadium and a lively street food strip on Adeniran Ogunsanya.' },
  { id: 'seed-zone-3', zoneName: 'Ikeja', activityScore: 85, activeUsers: 720, momentCount: 33, centerLat: 6.6010, centerLng: 3.3500, radiusMeters: 3400, summary: 'Computer Village, Allen Avenue nightlife and the Alausa malls keep the district busy all day.' },
  { id: 'seed-zone-4', zoneName: 'Ajah & Lekki-Epe', activityScore: 68, activeUsers: 330, momentCount: 14, centerLat: 6.4690, centerLng: 3.5700, radiusMeters: 4200, summary: 'Commuter build-ups at the Ajah roundabout and weekend beach trips toward the conservation centre.' },
  { id: 'seed-zone-5', zoneName: 'Apapa & Port Corridor', activityScore: 58, activeUsers: 210, momentCount: 9, centerLat: 6.4480, centerLng: 3.3620, radiusMeters: 3000, summary: 'Truck queues on the access roads; allow extra time and watch the diversion signs.' }
];

const avatar = (id: string) => unsplash(id, 200);

export const LAGOS_TEST_BUSINESSES: Business[] = [
  { id: 'seed-biz-1', name: 'Allen Grill House', description: 'Charcoal-grilled fish, suya platters and cold drinks until late.', category: 'Restaurant & Grill', location: '15 Allen Avenue, Ikeja', latitude: 6.601, longitude: 3.3515, verified: true, subscriptionPlan: 'pro', avatar: avatar('1555396273-367ea4eb4db5'), stats: { views: 2840, reach: 6900, clicks: 510, engagementRate: 12.4 } },
  { id: 'seed-biz-2', name: 'Stadium Suya Joint', description: 'Famous ram and beef suya, open late on match days.', category: 'Street Food', location: 'Adeniran Ogunsanya Street, Surulere', latitude: 6.4958, longitude: 3.356, verified: false, subscriptionPlan: 'starter', avatar: avatar('1514525253161-7a46d19cd819'), stats: { views: 1260, reach: 3100, clicks: 240, engagementRate: 9.6 } },
  { id: 'seed-biz-3', name: 'Cowrie Kitchen', description: 'Modern Nigerian small chops and palm wine on Lagos Island.', category: 'Restaurant', location: 'Marina, Lagos Island', latitude: 6.4505, longitude: 3.3935, verified: true, subscriptionPlan: 'pro', avatar: avatar('1517248135467-4c7edcad34c4'), stats: { views: 1980, reach: 5200, clicks: 380, engagementRate: 10.9 } },
  { id: 'seed-biz-4', name: 'Sandcastle Smoothie Bar', description: 'Fresh smoothies and acai bowls close to the Ajah beaches.', category: 'Cafe', location: 'Ajah, Lekki-Epe Expressway', latitude: 6.4698, longitude: 3.58, verified: false, subscriptionPlan: 'starter', avatar: avatar('1501339847302-ac426a4a7cbb'), stats: { views: 940, reach: 2300, clicks: 170, engagementRate: 8.1 } },
  { id: 'seed-biz-5', name: 'Hub Brew Yaba', description: 'Coworking cafe with fast wifi and single-origin pour-overs.', category: 'Coffee & Cafe', location: 'Herbert Macaulay Way, Yaba', latitude: 6.5086, longitude: 3.3715, verified: true, subscriptionPlan: 'enterprise', avatar: avatar('1501339847302-ac426a4a7cbb'), stats: { views: 3410, reach: 8800, clicks: 720, engagementRate: 13.7 } }
];

export const LAGOS_TEST_BUSINESS_POSTS: BusinessPost[] = [
  { id: 'seed-bpost-1', businessId: 'seed-biz-1', businessName: 'Allen Grill House', businessAvatar: avatar('1555396273-367ea4eb4db5'), title: 'Late-Night Grill Special', offer: 'Order any fish platter after 9 PM and get a free chilled drink. Show this pin to the waiter.', livePinType: 'Limited Offer', latitude: 6.601, longitude: 3.3515, createdAt: hoursAgo(1), expiresAt: hoursFromNow(8), clicks: 88, views: 520 },
  { id: 'seed-bpost-2', businessId: 'seed-biz-2', businessName: 'Stadium Suya Joint', businessAvatar: avatar('1514525253161-7a46d19cd819'), title: 'Match-Day Suya Truck', offer: 'Buy five sticks, get the sixth free until the final whistle.', livePinType: 'Food Truck', latitude: 6.4958, longitude: 3.356, createdAt: hoursAgo(2), expiresAt: hoursFromNow(4), clicks: 61, views: 340 },
  { id: 'seed-bpost-3', businessId: 'seed-biz-3', businessName: 'Cowrie Kitchen', businessAvatar: avatar('1517248135467-4c7edcad34c4'), title: 'Marina Happy Hour', offer: 'Half-price palm wine and small chops between 4 and 7 PM.', livePinType: 'Happy Hour', latitude: 6.4505, longitude: 3.3935, createdAt: hoursAgo(1.5), expiresAt: hoursFromNow(5), clicks: 74, views: 410 },
  { id: 'seed-bpost-4', businessId: 'seed-biz-4', businessName: 'Sandcastle Smoothie Bar', businessAvatar: avatar('1501339847302-ac426a4a7cbb'), title: 'Beach Day Flash Sale', offer: '30% off every smoothie bowl before 3 PM. Mention #PULSERADAR.', livePinType: 'Flash Sale', latitude: 6.4698, longitude: 3.58, createdAt: hoursAgo(0.5), expiresAt: hoursFromNow(3), clicks: 39, views: 215 },
  { id: 'seed-bpost-5', businessId: 'seed-biz-5', businessName: 'Hub Brew Yaba', businessAvatar: avatar('1501339847302-ac426a4a7cbb'), title: 'Founders Hour Flat White', offer: 'Free pastry with any flat white during the 3 to 4 PM founders hour.', livePinType: 'Happy Hour', latitude: 6.5086, longitude: 3.3715, createdAt: hoursAgo(1), expiresAt: hoursFromNow(6), clicks: 97, views: 580 }
];

export const LAGOS_TEST_COMMUNITIES: TemporaryCommunity[] = [
  { id: 'seed-comm-1', name: 'Landmark Beach Weekend', description: 'Meet-up hub for the food fair: parking tips, who is selling what and where to find the group.', triggerType: 'festival', momentId: 'seed-moment-9', centerLat: 6.427, centerLng: 3.446, activeUntil: hoursFromNow(16), memberCount: 262, unreadCount: 3 },
  { id: 'seed-comm-2', name: 'Computer Village Fair', description: 'Swap price checks, warranty tips and trusted stalls for the laptop fair.', triggerType: 'event', momentId: 'seed-moment-21', centerLat: 6.5959, centerLng: 3.3436, activeUntil: hoursFromNow(18), memberCount: 188, unreadCount: 1 },
  { id: 'seed-comm-3', name: 'Ajah Commuters', description: 'Live road updates for the Ajah roundabout, alternate routes and carpool offers.', triggerType: 'event', momentId: 'seed-moment-13', centerLat: 6.4682, centerLng: 3.5852, activeUntil: hoursFromNow(3), memberCount: 144, unreadCount: 0 },
  { id: 'seed-comm-4', name: 'Surulere Match Day', description: 'Pre-game banter, ticket swaps and post-match suya runs.', triggerType: 'concert', momentId: 'seed-moment-20', centerLat: 6.5006, centerLng: 3.3598, activeUntil: hoursFromNow(6), memberCount: 97, unreadCount: 2 }
];

const comment = (n: number, person: number, momentId: string, content: string, ageHours: number, likes: number, parentId?: string): Comment => {
  const p = PEOPLE[person % PEOPLE.length];
  return { id: `seed-c-${n}`, userId: p.id, userName: p.name, userAvatar: p.avatar, momentId, parentId, content, createdAt: hoursAgo(ageHours), likesCount: likes };
};

export const LAGOS_TEST_COMMENTS: Comment[] = [
  comment(1, 3, 'seed-moment-9', 'Is there parking close to the beach entrance or should I take a ride-share?', 1.5, 6),
  comment(2, 5, 'seed-moment-9', 'Ride-share is easier, the lot fills by noon. The main entrance is on the Oniru side.', 1, 11, 'seed-c-1'),
  comment(3, 4, 'seed-moment-13', 'Just passed the toll plaza, still crawling. Left lane is faster after the bus stop.', 0.4, 9),
  comment(4, 0, 'seed-moment-21', 'Any trusted stall for second-hand ThinkPads? Budget is around ₦350k.', 2, 4),
  comment(5, 2, 'seed-moment-21', 'Try the shops near the Otigba junction, ask for a seven-day return.', 1.5, 8, 'seed-c-4'),
  comment(6, 1, 'seed-moment-19', 'The pepper soup stand at the corner is the best, go before 7 PM.', 1, 5),
  comment(7, 4, 'seed-moment-4', 'Officers just cleared one lane, moving slowly now.', 0.2, 12)
];
