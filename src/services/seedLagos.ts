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
 * Apapa, Festac and Mile 12, and out west the Ojo region: Alaba International Market, Alaba Rago, Ojo town,
 * Okokomaiko, LASU, Ojo Barracks, Iba, Iyana-Iba, Agboju and Satellite Town, and further out the Badagry
 * Expressway towards Agbara: Ijanikin, Ilogbo-Eremi, Agbara Estate, Igbesa and Badagry town.
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

const CITY_TEST_MOMENTS: Moment[] = [
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

/** Ojo and the Badagry Expressway corridor, about 25 km west of Victoria Island */
const OJO_TEST_MOMENTS: Moment[] = [
  moment({ n: 31, person: 3, category: 'events', title: 'Alaba International Market Trade Fair', description: 'Wholesale electronics, appliances and audio gear with manufacturer reps on site. Free entry at Gate 2, bring a trolley bag.', area: 'Alaba International Market, Ojo', lat: 6.4572, lng: 3.1915, photo: PHOTO.night, ageHours: 3, leftHours: 21, reactions: { trending: 84, interested: 132, going: 61 }, views: 2480, comments: 11, verified: true }),
  moment({ n: 32, person: 1, category: 'deals', title: 'Alaba Rago Sound System Clearance', description: 'Speakers, amplifiers and car audio at end-of-season prices. Every unit is tested at the counter and comes with a receipt.', area: 'Alaba Rago, Ojo', lat: 6.459, lng: 3.196, ageHours: 2, leftHours: 9, reactions: { trending: 47, helpful: 21, interested: 39 }, views: 1330, comments: 6 }),
  moment({ n: 33, person: 4, category: 'alerts', title: 'Gridlock on the Badagry Expressway at Okokomaiko', description: 'A broken-down trailer is blocking the inbound lane. Danfo drivers are cutting through Ojo Road. Expect an hour of delay.', area: 'Okokomaiko, Ojo', lat: 6.4612, lng: 3.211, photo: PHOTO.traffic, ageHours: 0.5, leftHours: 3, reactions: { helpful: 34, confirmed: 26, trending: 38 }, views: 1190, comments: 10, verified: true }),
  moment({ n: 34, person: 4, category: 'alerts', title: 'Flooded Underpass at Iyana-Iba', description: 'Water is waist-high at the low point, small cars are stuck. Use the Iba Estate road or wait for the drainage crew.', area: 'Iyana-Iba, Ojo', lat: 6.479, lng: 3.217, ageHours: 0.7, leftHours: 2.5, reactions: { helpful: 25, confirmed: 18, trending: 22 }, comments: 7 }),
  moment({ n: 35, person: 0, category: 'food_drinks', title: 'Okokomaiko Ofada Rice and Peppered Ponmo', description: 'Ofada with ayamase, plantain and goat meat wrapped in leaf. Cash or transfer, the pot finishes by 5 PM.', area: 'Okokomaiko, Ojo', lat: 6.4628, lng: 3.2085, photo: PHOTO.food, ageHours: 2, leftHours: 8, reactions: { trending: 54, interested: 48, helpful: 17 }, views: 1420, comments: 8 }),
  moment({ n: 36, person: 2, category: 'activities', title: 'Morning Fun Run Around the LASU Campus', description: 'A relaxed 4K loop through the Ojo campus, open to staff, students and neighbours. Finish with free fruit and water.', area: 'Lagos State University, Ojo', lat: 6.466, lng: 3.1975, ageHours: 6, leftHours: 10, reactions: { going: 41, interested: 55, helpful: 9 }, comments: 5 }),
  moment({ n: 37, person: 2, category: 'events', title: 'LASU Careers and Skills Fair', description: 'Employers from banking, logistics and tech take CVs at the main auditorium. Dress smart and bring printed copies.', area: 'Lagos State University, Ojo', lat: 6.4685, lng: 3.2012, photo: PHOTO.music, ageHours: 4, leftHours: 14, reactions: { interested: 72, going: 38, trending: 15 }, views: 1650, comments: 9, verified: true }),
  moment({ n: 38, person: 1, category: 'community', title: 'Ojo Town Drain Clean-up and Market Sweep', description: 'Residents and traders are clearing the drains behind the market ahead of the rains. Gloves and sacks are provided.', area: 'Ojo Town', lat: 6.462, lng: 3.184, ageHours: 3, leftHours: 15, reactions: { going: 29, helpful: 21, interested: 24 }, comments: 4 }),
  moment({ n: 39, person: 5, category: 'recommendations', title: 'Fresh Fish and Crayfish at Iba Market', description: 'Catfish, croaker and dried crayfish straight from the creek boats. Go before 9 AM and haggle politely.', area: 'Iba Market, Ojo', lat: 6.4895, lng: 3.209, ageHours: 8, leftHours: 16, reactions: { helpful: 31, trending: 14 }, comments: 3 }),
  moment({ n: 40, person: 3, category: 'lost_found', title: 'Lost: Black Phone Near Alaba Market Gate 2', description: 'Dropped near the money changers around lunchtime. Black phone with a cracked cover and a green case. Reward offered.', area: 'Alaba International Market, Ojo', lat: 6.4565, lng: 3.1928, ageHours: 2, leftHours: 22, reactions: { helpful: 16, confirmed: 2 }, comments: 5 }),
  moment({ n: 41, person: 0, category: 'food_drinks', title: 'Ojo Cantonment Sunday Buka and Grill', description: 'Jollof, fried rice and grilled chicken for the after-church crowd. Plenty of seating under the canopy.', area: 'Ojo Cantonment', lat: 6.478, lng: 3.184, photo: PHOTO.food, ageHours: 1, leftHours: 9, reactions: { trending: 33, interested: 37, helpful: 10 }, comments: 4 }),
  moment({ n: 42, person: 4, category: 'events', title: 'Satellite Town Community Concert', description: 'Local bands, a gospel choir and a talent showcase on the open field. Bring a chair, free entry all evening.', area: 'Satellite Town, Amuwo-Odofin', lat: 6.4635, lng: 3.279, photo: PHOTO.music, ageHours: 2, leftHours: 13, reactions: { interested: 66, going: 44, trending: 29 }, views: 1710, comments: 8 }),
  moment({ n: 43, person: 2, category: 'deals', title: 'Agboju Market Bulk Foodstuff Discount', description: 'Beans, rice and garri at wholesale prices for anyone buying by the bag. Stalls near the main gate.', area: 'Agboju Market, Amuwo-Odofin', lat: 6.4585, lng: 3.254, ageHours: 3, leftHours: 12, reactions: { trending: 27, helpful: 19, interested: 23 }, comments: 3 }),
  moment({ n: 44, person: 5, category: 'activities', title: 'Canoe Ride on the Ojo Creek', description: 'One-hour guided paddle past the mangroves, life jackets provided. Leaves from the jetty every 30 minutes until dusk.', area: 'Ojo Creek jetty', lat: 6.4555, lng: 3.18, ageHours: 5, leftHours: 7, reactions: { interested: 35, going: 14, helpful: 6 }, comments: 2 })
];

/** The Badagry Expressway beyond Ojo: Ijanikin, Ilogbo-Eremi, Agbara and Igbesa (Ogun side), and Badagry town */
const AGBARA_TEST_MOMENTS: Moment[] = [
  moment({ n: 45, person: 4, category: 'alerts', title: 'Staff Shuttle Delays at the Agbara Estate Gate', description: 'Morning shift buses are queued back to the expressway while security checks are done. Allow an extra 40 minutes, or walk the last stretch.', area: 'Agbara Industrial Estate', lat: 6.5165, lng: 2.887, photo: PHOTO.traffic, ageHours: 0.6, leftHours: 3, reactions: { helpful: 29, confirmed: 22, trending: 31 }, views: 1040, comments: 8, verified: true }),
  moment({ n: 46, person: 2, category: 'deals', title: 'Agbara Central Market Foodstuff Day', description: 'Rice, beans, garri and palm oil by the bag at the stalls near the main gate. Early buyers get a free measure of pepper.', area: 'Agbara Market', lat: 6.511, lng: 2.895, ageHours: 3, leftHours: 11, reactions: { trending: 36, helpful: 20, interested: 28 }, views: 1210, comments: 5 }),
  moment({ n: 47, person: 1, category: 'community', title: 'Ilogbo-Eremi Road Repair Volunteer Day', description: 'Residents are filling potholes with donated gravel on the market road. Bring a shovel or just a pair of gloves.', area: 'Ilogbo-Eremi', lat: 6.495, lng: 2.937, ageHours: 4, leftHours: 14, reactions: { going: 31, helpful: 24, interested: 19 }, comments: 4 }),
  moment({ n: 48, person: 4, category: 'alerts', title: 'Standstill on the Badagry Expressway at Agbara Junction', description: 'A broken-down tanker is blocking the left lane heading towards Lagos. Okada riders are using the shoulder. Expect long delays.', area: 'Agbara Junction, Badagry Expressway', lat: 6.5058, lng: 2.9065, photo: PHOTO.traffic, ageHours: 0.4, leftHours: 4, reactions: { helpful: 38, confirmed: 30, trending: 44 }, views: 1480, comments: 12 }),
  moment({ n: 49, person: 0, category: 'food_drinks', title: 'Igbesa Pepper Soup and Roast Fish Joint', description: 'Catfish pepper soup, roasted tilapia and cold drinks under the mango tree. Busy after 6 PM, plenty of parking.', area: 'Igbesa', lat: 6.54, lng: 2.933, photo: PHOTO.food, ageHours: 2, leftHours: 10, reactions: { trending: 41, interested: 39, helpful: 12 }, comments: 6 }),
  moment({ n: 50, person: 5, category: 'activities', title: 'Saturday Cycle Club Ride Around Agbara Estate', description: 'A relaxed 15 km loop on the estate roads, helmets required, loan bikes available at the clubhouse. Breakfast after the ride.', area: 'Agbara Estate', lat: 6.519, lng: 2.88, ageHours: 5, leftHours: 12, reactions: { going: 27, interested: 33, helpful: 6 }, comments: 3 }),
  moment({ n: 51, person: 3, category: 'lost_found', title: 'Lost: Brown Handbag at the Agbara Bus Stop', description: 'Left on the shuttle seat around 6 PM. Brown leather handbag with an ID card and a work lanyard. Please call the number inside.', area: 'Agbara Bus Stop', lat: 6.5125, lng: 2.8925, ageHours: 3, leftHours: 21, reactions: { helpful: 15, confirmed: 2 }, comments: 4 }),
  moment({ n: 52, person: 0, category: 'events', title: 'Agbara Industrial Trade Expo', description: 'Suppliers and manufacturers show packaging, tooling and logistics services in the estate conference hall. Free registration at the gate.', area: 'Agbara Industrial Estate', lat: 6.5148, lng: 2.8855, photo: PHOTO.night, ageHours: 4, leftHours: 20, reactions: { interested: 58, going: 33, trending: 17 }, views: 1390, comments: 7, verified: true }),
  moment({ n: 53, person: 2, category: 'deals', title: 'Ilogbo Market Fabric and Lace Sale', description: 'Ankara, lace and aso-oke at wholesale prices from the weaver stalls. Tailors are on site for same-day fittings.', area: 'Ilogbo-Eremi Market', lat: 6.4965, lng: 2.9345, ageHours: 2, leftHours: 9, reactions: { trending: 29, helpful: 17, interested: 26 }, comments: 3 }),
  moment({ n: 54, person: 1, category: 'events', title: 'Ijanikin Community Praise and Food Night', description: 'Choirs, a talent corner and a plate-sharing evening on the primary school field. Everyone is welcome, bring a chair.', area: 'Ijanikin', lat: 6.4725, lng: 3.13, photo: PHOTO.music, ageHours: 3, leftHours: 15, reactions: { interested: 44, going: 28, trending: 12 }, comments: 5 }),
  moment({ n: 55, person: 5, category: 'recommendations', title: 'Quiet Palm Garden Restaurant on the Way to Agbara', description: 'Shaded tables, a good pounded yam and a clean restroom, rare on this road. Stop here before the long stretch to the border.', area: 'Badagry Expressway near Ajara', lat: 6.4585, lng: 2.985, ageHours: 7, leftHours: 17, reactions: { helpful: 26, trending: 11 }, comments: 3 }),
  moment({ n: 56, person: 3, category: 'events', title: 'Heritage Weekend at the Badagry Museum', description: 'Guided walks through the old slave port exhibits and a drum and dance showcase in the courtyard. Entry from \u20a61,500.', area: 'Badagry Town', lat: 6.418, lng: 2.885, photo: PHOTO.music, ageHours: 4, leftHours: 18, reactions: { interested: 52, going: 24, helpful: 10 }, views: 1240, comments: 6, verified: true }),
  moment({ n: 57, person: 5, category: 'activities', title: 'Sunrise Walk to the Point of No Return Beach', description: 'A guided walk along the old trail to the lagoon beach with a short history talk. Start at the jetty at 6 AM.', area: 'Point of No Return, Badagry', lat: 6.377, lng: 2.887, ageHours: 6, leftHours: 10, reactions: { going: 19, interested: 41, helpful: 7 }, comments: 2 }),
  moment({ n: 58, person: 4, category: 'alerts', title: 'Flooded Stretch Near Mowo on the Badagry Road', description: 'Water is across both lanes at the low point, only high-clearance vehicles are getting through. Trucks are stopping to wait.', area: 'Mowo, Badagry Road', lat: 6.4335, lng: 2.9235, ageHours: 0.8, leftHours: 3.5, reactions: { helpful: 24, confirmed: 17, trending: 20 }, comments: 6 })
];

export const LAGOS_TEST_MOMENTS: Moment[] = [...CITY_TEST_MOMENTS, ...OJO_TEST_MOMENTS, ...AGBARA_TEST_MOMENTS];

export const LAGOS_TEST_ZONES: ActivityZone[] = [
  { id: 'seed-zone-1', zoneName: 'Ikoyi & Obalende', activityScore: 79, activeUsers: 470, momentCount: 19, centerLat: 6.4470, centerLng: 3.4180, radiusMeters: 2600, summary: 'Cafes, suya queues at Obalende and heavy evening traffic through Falomo.' },
  { id: 'seed-zone-2', zoneName: 'Surulere', activityScore: 71, activeUsers: 390, momentCount: 16, centerLat: 6.4990, centerLng: 3.3580, radiusMeters: 2800, summary: 'Match-day crowds near the stadium and a lively street food strip on Adeniran Ogunsanya.' },
  { id: 'seed-zone-3', zoneName: 'Ikeja', activityScore: 85, activeUsers: 720, momentCount: 33, centerLat: 6.6010, centerLng: 3.3500, radiusMeters: 3400, summary: 'Computer Village, Allen Avenue nightlife and the Alausa malls keep the district busy all day.' },
  { id: 'seed-zone-4', zoneName: 'Ajah & Lekki-Epe', activityScore: 68, activeUsers: 330, momentCount: 14, centerLat: 6.4690, centerLng: 3.5700, radiusMeters: 4200, summary: 'Commuter build-ups at the Ajah roundabout and weekend beach trips toward the conservation centre.' },
  { id: 'seed-zone-6', zoneName: 'Ojo & Alaba', activityScore: 76, activeUsers: 430, momentCount: 18, centerLat: 6.4620, centerLng: 3.2000, radiusMeters: 3600, summary: 'Alaba International Market trading, LASU campus energy and heavy Badagry Expressway traffic at Okokomaiko.' },
  { id: 'seed-zone-7', zoneName: 'Agbara & Badagry Corridor', activityScore: 64, activeUsers: 280, momentCount: 12, centerLat: 6.4900, centerLng: 2.9100, radiusMeters: 9000, summary: 'Estate shift traffic at Agbara, market days at Ilogbo-Eremi and heritage tourism in Badagry town.' },
  { id: 'seed-zone-5', zoneName: 'Apapa & Port Corridor', activityScore: 58, activeUsers: 210, momentCount: 9, centerLat: 6.4480, centerLng: 3.3620, radiusMeters: 3000, summary: 'Truck queues on the access roads; allow extra time and watch the diversion signs.' }
];

const avatar = (id: string) => unsplash(id, 200);

export const LAGOS_TEST_BUSINESSES: Business[] = [
  { id: 'seed-biz-1', name: 'Allen Grill House', description: 'Charcoal-grilled fish, suya platters and cold drinks until late.', category: 'Restaurant & Grill', location: '15 Allen Avenue, Ikeja', latitude: 6.601, longitude: 3.3515, verified: true, subscriptionPlan: 'pro', avatar: avatar('1555396273-367ea4eb4db5'), stats: { views: 2840, reach: 6900, clicks: 510, engagementRate: 12.4 } },
  { id: 'seed-biz-2', name: 'Stadium Suya Joint', description: 'Famous ram and beef suya, open late on match days.', category: 'Street Food', location: 'Adeniran Ogunsanya Street, Surulere', latitude: 6.4958, longitude: 3.356, verified: false, subscriptionPlan: 'starter', avatar: avatar('1514525253161-7a46d19cd819'), stats: { views: 1260, reach: 3100, clicks: 240, engagementRate: 9.6 } },
  { id: 'seed-biz-3', name: 'Cowrie Kitchen', description: 'Modern Nigerian small chops and palm wine on Lagos Island.', category: 'Restaurant', location: 'Marina, Lagos Island', latitude: 6.4505, longitude: 3.3935, verified: true, subscriptionPlan: 'pro', avatar: avatar('1517248135467-4c7edcad34c4'), stats: { views: 1980, reach: 5200, clicks: 380, engagementRate: 10.9 } },
  { id: 'seed-biz-4', name: 'Sandcastle Smoothie Bar', description: 'Fresh smoothies and acai bowls close to the Ajah beaches.', category: 'Cafe', location: 'Ajah, Lekki-Epe Expressway', latitude: 6.4698, longitude: 3.58, verified: false, subscriptionPlan: 'starter', avatar: avatar('1501339847302-ac426a4a7cbb'), stats: { views: 940, reach: 2300, clicks: 170, engagementRate: 8.1 } },
  { id: 'seed-biz-6', name: 'Alaba Gadget World', description: 'Wholesale phones, laptops and accessories with warranty and receipts.', category: 'Electronics', location: 'Gate 2, Alaba International Market, Ojo', latitude: 6.4572, longitude: 3.1915, verified: true, subscriptionPlan: 'pro', avatar: avatar('1514525253161-7a46d19cd819'), stats: { views: 2210, reach: 5600, clicks: 430, engagementRate: 11.2 } },
  { id: 'seed-biz-7', name: 'Ofada Corner Okokomaiko', description: 'Ofada rice, ayamase and peppered meats served in leaf.', category: 'Street Food', location: 'Okokomaiko, Ojo', latitude: 6.4628, longitude: 3.2085, verified: false, subscriptionPlan: 'starter', avatar: avatar('1555396273-367ea4eb4db5'), stats: { views: 890, reach: 2100, clicks: 160, engagementRate: 8.7 } },
  { id: 'seed-biz-8', name: 'Estate Bistro Agbara', description: 'Hot lunches, pepper soup and cold drinks for the estate shifts.', category: 'Restaurant', location: 'Main Road, Agbara Estate', latitude: 6.5148, longitude: 2.8855, verified: true, subscriptionPlan: 'pro', avatar: avatar('1555396273-367ea4eb4db5'), stats: { views: 1450, reach: 3600, clicks: 270, engagementRate: 10.3 } },
  { id: 'seed-biz-5', name: 'Hub Brew Yaba', description: 'Coworking cafe with fast wifi and single-origin pour-overs.', category: 'Coffee & Cafe', location: 'Herbert Macaulay Way, Yaba', latitude: 6.5086, longitude: 3.3715, verified: true, subscriptionPlan: 'enterprise', avatar: avatar('1501339847302-ac426a4a7cbb'), stats: { views: 3410, reach: 8800, clicks: 720, engagementRate: 13.7 } }
];

export const LAGOS_TEST_BUSINESS_POSTS: BusinessPost[] = [
  { id: 'seed-bpost-1', businessId: 'seed-biz-1', businessName: 'Allen Grill House', businessAvatar: avatar('1555396273-367ea4eb4db5'), title: 'Late-Night Grill Special', offer: 'Order any fish platter after 9 PM and get a free chilled drink. Show this pin to the waiter.', livePinType: 'Limited Offer', latitude: 6.601, longitude: 3.3515, createdAt: hoursAgo(1), expiresAt: hoursFromNow(8), clicks: 88, views: 520 },
  { id: 'seed-bpost-2', businessId: 'seed-biz-2', businessName: 'Stadium Suya Joint', businessAvatar: avatar('1514525253161-7a46d19cd819'), title: 'Match-Day Suya Truck', offer: 'Buy five sticks, get the sixth free until the final whistle.', livePinType: 'Food Truck', latitude: 6.4958, longitude: 3.356, createdAt: hoursAgo(2), expiresAt: hoursFromNow(4), clicks: 61, views: 340 },
  { id: 'seed-bpost-3', businessId: 'seed-biz-3', businessName: 'Cowrie Kitchen', businessAvatar: avatar('1517248135467-4c7edcad34c4'), title: 'Marina Happy Hour', offer: 'Half-price palm wine and small chops between 4 and 7 PM.', livePinType: 'Happy Hour', latitude: 6.4505, longitude: 3.3935, createdAt: hoursAgo(1.5), expiresAt: hoursFromNow(5), clicks: 74, views: 410 },
  { id: 'seed-bpost-4', businessId: 'seed-biz-4', businessName: 'Sandcastle Smoothie Bar', businessAvatar: avatar('1501339847302-ac426a4a7cbb'), title: 'Beach Day Flash Sale', offer: '30% off every smoothie bowl before 3 PM. Mention #PULSERADAR.', livePinType: 'Flash Sale', latitude: 6.4698, longitude: 3.58, createdAt: hoursAgo(0.5), expiresAt: hoursFromNow(3), clicks: 39, views: 215 },
  { id: 'seed-bpost-6', businessId: 'seed-biz-6', businessName: 'Alaba Gadget World', businessAvatar: avatar('1514525253161-7a46d19cd819'), title: 'Trade Fair Bundle: Phone and Power Bank', offer: 'Buy any phone during the fair and get a power bank at cost. Show this pin at the counter.', livePinType: 'Limited Offer', latitude: 6.4572, longitude: 3.1915, createdAt: hoursAgo(1), expiresAt: hoursFromNow(9), clicks: 71, views: 450 },
  { id: 'seed-bpost-7', businessId: 'seed-biz-7', businessName: 'Ofada Corner Okokomaiko', businessAvatar: avatar('1555396273-367ea4eb4db5'), title: 'Lunch-Hour Ofada Plate', offer: 'Free extra plantain with every ofada plate before 3 PM. Mention #PULSERADAR.', livePinType: 'Food Truck', latitude: 6.4628, longitude: 3.2085, createdAt: hoursAgo(0.7), expiresAt: hoursFromNow(4), clicks: 44, views: 260 },
  { id: 'seed-bpost-8', businessId: 'seed-biz-8', businessName: 'Estate Bistro Agbara', businessAvatar: avatar('1555396273-367ea4eb4db5'), title: 'Shift-Change Lunch Special', offer: 'Show this pin for a free drink with any lunch combo between 12 and 3 PM.', livePinType: 'Limited Offer', latitude: 6.5148, longitude: 2.8855, createdAt: hoursAgo(0.8), expiresAt: hoursFromNow(5), clicks: 38, views: 230 },
  { id: 'seed-bpost-5', businessId: 'seed-biz-5', businessName: 'Hub Brew Yaba', businessAvatar: avatar('1501339847302-ac426a4a7cbb'), title: 'Founders Hour Flat White', offer: 'Free pastry with any flat white during the 3 to 4 PM founders hour.', livePinType: 'Happy Hour', latitude: 6.5086, longitude: 3.3715, createdAt: hoursAgo(1), expiresAt: hoursFromNow(6), clicks: 97, views: 580 }
];

export const LAGOS_TEST_COMMUNITIES: TemporaryCommunity[] = [
  { id: 'seed-comm-1', name: 'Landmark Beach Weekend', description: 'Meet-up hub for the food fair: parking tips, who is selling what and where to find the group.', triggerType: 'festival', momentId: 'seed-moment-9', centerLat: 6.427, centerLng: 3.446, activeUntil: hoursFromNow(16), memberCount: 262, unreadCount: 3 },
  { id: 'seed-comm-2', name: 'Computer Village Fair', description: 'Swap price checks, warranty tips and trusted stalls for the laptop fair.', triggerType: 'event', momentId: 'seed-moment-21', centerLat: 6.5959, centerLng: 3.3436, activeUntil: hoursFromNow(18), memberCount: 188, unreadCount: 1 },
  { id: 'seed-comm-3', name: 'Ajah Commuters', description: 'Live road updates for the Ajah roundabout, alternate routes and carpool offers.', triggerType: 'event', momentId: 'seed-moment-13', centerLat: 6.4682, centerLng: 3.5852, activeUntil: hoursFromNow(3), memberCount: 144, unreadCount: 0 },
  { id: 'seed-comm-5', name: 'Alaba Trade Fair', description: 'Traders and buyers swap price checks, trusted stalls and transport tips for the fair.', triggerType: 'event', momentId: 'seed-moment-31', centerLat: 6.4572, centerLng: 3.1915, activeUntil: hoursFromNow(20), memberCount: 226, unreadCount: 2 },
  { id: 'seed-comm-6', name: 'LASU Campus Today', description: 'Students share timetable changes, the careers fair queue and shuttle times.', triggerType: 'campus', momentId: 'seed-moment-37', centerLat: 6.4685, centerLng: 3.2012, activeUntil: hoursFromNow(14), memberCount: 312, unreadCount: 0 },
  { id: 'seed-comm-7', name: 'Agbara Estate Commuters', description: 'Shuttle times, gate delays and carpool offers for the Agbara industrial estate.', triggerType: 'event', momentId: 'seed-moment-45', centerLat: 6.5165, centerLng: 2.887, activeUntil: hoursFromNow(8), memberCount: 174, unreadCount: 2 },
  { id: 'seed-comm-8', name: 'Badagry Heritage Weekend', description: 'Visitors and guides coordinating museum walks, transport and beach trips.', triggerType: 'festival', momentId: 'seed-moment-56', centerLat: 6.418, centerLng: 2.885, activeUntil: hoursFromNow(18), memberCount: 121, unreadCount: 1 },
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
  comment(7, 4, 'seed-moment-4', 'Officers just cleared one lane, moving slowly now.', 0.2, 12),
  comment(8, 3, 'seed-moment-31', 'Which gate is best for the audio section, and is there a trolley hire point?', 2, 5),
  comment(9, 1, 'seed-moment-31', 'Gate 2 for audio. Trolleys are \u20a6500 at the gate, bring small notes.', 1.5, 9, 'seed-c-8'),
  comment(10, 4, 'seed-moment-33', 'Trailer has been moved to the shoulder, the line is slowly moving now.', 0.2, 14),
  comment(11, 2, 'seed-moment-37', 'Do they accept soft copies of the CV or only printed ones?', 1, 3),
  comment(12, 5, 'seed-moment-44', 'Went last weekend, the mangrove stretch is worth it. Bring a hat.', 3, 7),
  comment(13, 4, 'seed-moment-45', 'Gate is moving now but the queue still reaches the junction. Leave early.', 0.3, 8),
  comment(14, 0, 'seed-moment-48', 'Tanker has been towed off the road, traffic is easing slowly.', 0.2, 13),
  comment(15, 3, 'seed-moment-56', 'Is the museum open on Sunday, and is there parking at the gate?', 2, 4),
  comment(16, 5, 'seed-moment-56', 'Open all weekend. Park at the jetty side, it is a short walk.', 1.5, 7, 'seed-c-15')
];
