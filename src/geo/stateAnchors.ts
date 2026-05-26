/**
 * Representative points per state for Search Box `proximity` bias and hover flyTo.
 * Nationwide POI search runs one forward query per anchor; `searchBbox` limits each
 * request to that state's extent (improves in-state hits vs a single US-wide box).
 */
export type StateAnchorPoint = {
    readonly state: string
    readonly lng: number
    readonly lat: number
}

/** Search anchor: proximity point + Mapbox Search Box `bbox` (minLng,minLat,maxLng,maxLat). */
export type StateSearchAnchor = StateAnchorPoint & {
    readonly searchBbox: string
}

// --- Fly Anchors ---
/** US state geographic centers — lng/lat (WGS84). */
export const US_STATE_FLY_ANCHORS: readonly StateAnchorPoint[] = [
    // Modern list (centroid / center-of-gravity), per Wikipedia:
    // https://en.wikipedia.org/wiki/List_of_geographic_centers_of_the_United_States
    { state: 'Alabama', lng: -86.8287, lat: 32.7794 },
    { state: 'Alaska', lng: -152.2782, lat: 64.0685 },
    { state: 'Arizona', lng: -111.6602, lat: 34.2744 },
    { state: 'Arkansas', lng: -92.4426, lat: 34.8938 },
    { state: 'California', lng: -119.4696, lat: 37.1841 },
    { state: 'Colorado', lng: -105.5478, lat: 38.9972 },
    { state: 'Connecticut', lng: -72.7273, lat: 41.6219 },
    { state: 'Delaware', lng: -75.505, lat: 38.9896 },
    { state: 'Florida', lng: -82.4497, lat: 28.6305 },
    { state: 'Georgia', lng: -83.4426, lat: 32.6415 },
    { state: 'Hawaii', lng: -156.3737, lat: 20.2927 },
    { state: 'Idaho', lng: -114.613, lat: 44.3509 },
    { state: 'Illinois', lng: -89.1965, lat: 40.0417 },
    { state: 'Indiana', lng: -86.2816, lat: 39.8942 },
    { state: 'Iowa', lng: -93.496, lat: 42.0751 },
    { state: 'Kansas', lng: -98.37722, lat: 38.49389 },
    { state: 'Kentucky', lng: -85.3021, lat: 37.5347 },
    { state: 'Louisiana', lng: -91.9968, lat: 31.0689 },
    { state: 'Maine', lng: -69.2428, lat: 45.3695 },
    { state: 'Maryland', lng: -76.7909, lat: 39.055 },
    { state: 'Massachusetts', lng: -71.8083, lat: 42.2596 },
    { state: 'Michigan', lng: -85.4102, lat: 44.3467 },
    { state: 'Minnesota', lng: -94.3053, lat: 46.2807 },
    { state: 'Mississippi', lng: -89.6678, lat: 32.7364 },
    { state: 'Missouri', lng: -92.458, lat: 38.3566 },
    { state: 'Montana', lng: -109.6333, lat: 47.0527 },
    { state: 'Nebraska', lng: -99.7951, lat: 41.5378 },
    { state: 'Nevada', lng: -116.6312, lat: 39.3289 },
    { state: 'New Hampshire', lng: -71.5811, lat: 43.6805 },
    { state: 'New Jersey', lng: -74.6728, lat: 40.1907 },
    { state: 'New Mexico', lng: -106.1126, lat: 34.4071 },
    { state: 'New York', lng: -75.5268, lat: 42.9538 },
    { state: 'North Carolina', lng: -79.3877, lat: 35.5557 },
    { state: 'North Dakota', lng: -100.4659, lat: 47.4501 },
    { state: 'Ohio', lng: -82.7937, lat: 40.2862 },
    { state: 'Oklahoma', lng: -97.4943, lat: 35.5889 },
    { state: 'Oregon', lng: -120.5583, lat: 43.9336 },
    { state: 'Pennsylvania', lng: -77.7996, lat: 40.8781 },
    { state: 'Rhode Island', lng: -71.5562, lat: 41.6762 },
    { state: 'South Carolina', lng: -80.8964, lat: 33.9169 },
    { state: 'South Dakota', lng: -100.2263, lat: 44.4443 },
    { state: 'Tennessee', lng: -86.3505, lat: 35.858 },
    { state: 'Texas', lng: -99.3312, lat: 31.4757 },
    { state: 'Utah', lng: -111.6703, lat: 39.3055 },
    { state: 'Vermont', lng: -72.6658, lat: 44.0687 },
    { state: 'Virginia', lng: -78.8537, lat: 37.5215 },
    { state: 'Washington', lng: -120.4472, lat: 47.3826 },
    { state: 'West Virginia', lng: -80.6227, lat: 38.6409 },
    { state: 'Wisconsin', lng: -89.9941, lat: 44.6243 },
    { state: 'Wyoming', lng: -107.5512, lat: 42.9957 },
]

// --- Search Anchors ---
// State capitals for proximity; searchBbox from state polygon extents (+0.05° pad).
// Source geometry: https://github.com/PublicaMundi/MappingAPI (us-states.geojson)
export const US_STATE_SEARCH_ANCHORS: readonly StateSearchAnchor[] = [
    { state: 'Alabama', lng: -86.3001, lat: 32.3668, searchBbox: '-88.5211,30.1972,-84.8392,35.0512' },
    { state: 'Alaska', lng: -134.4197, lat: 58.3019, searchBbox: '-180,51.5627,-129.9363,71.4016' },
    { state: 'Arizona', lng: -112.074, lat: 33.4484, searchBbox: '-114.8652,31.2816,-108.9925,37.0557' },
    { state: 'Arkansas', lng: -92.2896, lat: 34.7465, searchBbox: '-94.6662,32.9521,-89.6808,36.5519' },
    { state: 'California', lng: -121.4944, lat: 38.5816, searchBbox: '-124.4608,32.4866,-114.0861,42.0617' },
    { state: 'Colorado', lng: -104.9903, lat: 39.7392, searchBbox: '-109.1089,36.9448,-101.993,41.0539' },
    { state: 'Connecticut', lng: -72.6734, lat: 41.7658, searchBbox: '-73.7772,40.9375,-71.7493,42.1' },
    { state: 'Delaware', lng: -75.5268, lat: 39.1582, searchBbox: '-75.8365,38.4017,-74.9971,39.8818' },
    { state: 'Florida', lng: -84.2807, lat: 30.4383, searchBbox: '-87.6831,25.0708,-79.9811,31.053' },
    { state: 'Georgia', lng: -84.388, lat: 33.749, searchBbox: '-85.6567,30.3067,-80.8356,35.0512' },
    { state: 'Hawaii', lng: -157.8583, lat: 21.3069, searchBbox: '-159.8144,18.8983,-154.7578,22.279' },
    { state: 'Idaho', lng: -116.2023, lat: 43.615, searchBbox: '-117.2915,41.9452,-110.9971,49.0502' },
    { state: 'Illinois', lng: -89.6501, lat: 39.7817, searchBbox: '-91.5553,36.9338,-87.4462,42.5601' },
    { state: 'Indiana', lng: -86.1581, lat: 39.7684, searchBbox: '-88.1103,37.7389,-84.7516,41.8097' },
    { state: 'Iowa', lng: -93.625, lat: 41.5868, searchBbox: '-96.6818,40.3295,-90.0916,43.5514' },
    { state: 'Kansas', lng: -95.689, lat: 39.0473, searchBbox: '-102.1039,36.9448,-94.5608,40.0516' },
    { state: 'Kentucky', lng: -84.8733, lat: 38.2009, searchBbox: '-89.4686,36.4464,-81.92,39.1534' },
    { state: 'Louisiana', lng: -91.1871, lat: 30.4515, searchBbox: '-94.0912,28.9594,-88.9524,33.0685' },
    { state: 'Maine', lng: -69.7653, lat: 44.3235, searchBbox: '-71.1318,43.0078,-66.9296,47.5112' },
    { state: 'Maryland', lng: -76.4922, lat: 38.9784, searchBbox: '-79.5389,37.8594,-74.9971,39.7723' },
    { state: 'Massachusetts', lng: -71.0589, lat: 42.3601, searchBbox: '-73.5581,41.4468,-69.8871,42.938' },
    { state: 'Michigan', lng: -84.5467, lat: 42.7325, searchBbox: '-90.4654,41.644,-82.3636,48.2232' },
    { state: 'Minnesota', lng: -93.09, lat: 44.9537, searchBbox: '-97.2787,43.4514,-89.5658,49.4336' },
    { state: 'Mississippi', lng: -90.1848, lat: 32.2988, searchBbox: '-91.6868,30.1315,-88.0487,35.0457' },
    { state: 'Missouri', lng: -92.1735, lat: 38.5767, searchBbox: '-95.8164,35.948,-89.0838,40.665' },
    { state: 'Montana', lng: -112.0391, lat: 46.5891, searchBbox: '-116.0975,44.3441,-103.9921,49.0502' },
    { state: 'Nebraska', lng: -96.7026, lat: 40.8136, searchBbox: '-104.103,39.9516,-95.2563,43.053' },
    { state: 'Nevada', lng: -119.7674, lat: 39.1638, searchBbox: '-120.0519,34.9512,-113.993,42.0507' },
    { state: 'New Hampshire', lng: -71.5376, lat: 43.2081, searchBbox: '-72.5942,42.6463,-70.6539,45.3533' },
    { state: 'New Jersey', lng: -74.7564, lat: 40.2206, searchBbox: '-75.612,38.9439,-73.8525,41.4099' },
    { state: 'New Mexico', lng: -105.9378, lat: 35.687, searchBbox: '-109.098,31.2816,-102.9514,37.0503' },
    { state: 'New York', lng: -73.7562, lat: 42.6526, searchBbox: '-79.8128,40.4938,-72.0505,45.0685' },
    { state: 'North Carolina', lng: -78.6382, lat: 35.7796, searchBbox: '-84.3696,33.7955,-75.6653,36.6395' },
    { state: 'North Dakota', lng: -100.7837, lat: 46.8208, searchBbox: '-104.0975,45.8832,-96.5106,49.0502' },
    { state: 'Ohio', lng: -82.9988, lat: 39.9612, searchBbox: '-84.868,38.3743,-80.4686,42.0288' },
    { state: 'Oklahoma', lng: -97.5164, lat: 35.4676, searchBbox: '-103.0514,33.5874,-94.38,37.0503' },
    { state: 'Oregon', lng: -123.0351, lat: 44.9429, searchBbox: '-124.6032,41.9398,-116.4138,46.3118' },
    { state: 'Pennsylvania', lng: -76.8867, lat: 40.2732, searchBbox: '-80.5686,39.6723,-74.6466,42.3191' },
    { state: 'Rhode Island', lng: -71.4128, lat: 41.824, searchBbox: '-71.9096,41.2716,-71.0702,42.0671' },
    { state: 'South Carolina', lng: -81.0348, lat: 34.0007, searchBbox: '-83.3892,31.9827,-78.4914,35.2483' },
    { state: 'South Dakota', lng: -100.351, lat: 44.3683, searchBbox: '-104.1085,42.4382,-96.3846,45.9941' },
    { state: 'Tennessee', lng: -86.7816, lat: 36.1627, searchBbox: '-90.3614,34.9347,-81.6297,36.7271' },
    { state: 'Texas', lng: -97.7431, lat: 30.2672, searchBbox: '-106.6936,25.8376,-93.4763,36.5519' },
    { state: 'Utah', lng: -111.891, lat: 40.7608, searchBbox: '-114.0984,36.9503,-108.9925,42.0507' },
    { state: 'Vermont', lng: -72.5754, lat: 44.2601, searchBbox: '-73.4869,42.6791,-71.4426,45.063' },
    { state: 'Virginia', lng: -77.436, lat: 37.5407, searchBbox: '-83.7233,36.4902,-75.1943,39.5149' },
    { state: 'Washington', lng: -122.9007, lat: 47.0379, searchBbox: '-124.7566,45.4998,-116.8683,49.0502' },
    { state: 'West Virginia', lng: -81.6326, lat: 38.3498, searchBbox: '-82.6717,37.1529,-77.6699,40.687' },
    { state: 'Wisconsin', lng: -89.3838, lat: 43.0748, searchBbox: '-92.9355,42.4436,-86.9807,47.0073' },
    { state: 'Wyoming', lng: -104.8202, lat: 41.14, searchBbox: '-111.1025,40.9484,-104.003,45.0521' },
]
