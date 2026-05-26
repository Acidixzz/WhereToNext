/** State name field on USAStates tiles (matches POI geocode labels). */
export const STATE_NAME_FIELD = 'STATE_NAME'


/** County polygon fields tried in order for geography matching. */
export const COUNTY_NAME_FIELDS = ['NAMELSAD', 'NAME', 'county_name', 'COUNTY_NAME'] as const

export const COUNTY_STATE_FIELD = 'STATE_NAME'

const COUNTY_SUFFIX_RE = /\s+(County|Parish|Borough|Census Area|Municipality)$/i

export function pickCountyStateFromTileProps(
    props: Record<string, unknown> | null | undefined,
): { state: string; county: string } | null {
    if (!props || typeof props !== 'object') return null

    let county: string | undefined
    for (const field of COUNTY_NAME_FIELDS) {
        const v = props[field]
        if (typeof v === 'string' && v.trim().length > 0) {
            county = v.trim()
            break
        }
    }

    const stateRaw =
        props[COUNTY_STATE_FIELD] ??
        props.state ??
        props.STATE ??
        props.state_name ??
        props.STUSPS
    const state = typeof stateRaw === 'string' && stateRaw.trim().length > 0 ? stateRaw.trim() : undefined

    if (!county || !state) return null
    return { state, county }
}

/** Labels to try when matching POI county names to tile attributes. */
export function countyLabelVariants(county: string): string[] {
    const base = county.trim()
    if (!base) return []

    const variants = new Set<string>([base])
    if (!COUNTY_SUFFIX_RE.test(base)) {
        variants.add(`${base} County`)
        variants.add(`${base} Parish`)
        variants.add(`${base} Borough`)
    }

    const stripped = base.replace(COUNTY_SUFFIX_RE, '').trim()
    if (stripped.length > 0) variants.add(stripped)

    return [...variants]
}

/** USPS abbreviations → full state name (tile `STATE_NAME` uses full names). */
const STATE_ABBREV_TO_NAME: Record<string, string> = {
    AL: 'Alabama',
    AK: 'Alaska',
    AZ: 'Arizona',
    AR: 'Arkansas',
    CA: 'California',
    CO: 'Colorado',
    CT: 'Connecticut',
    DE: 'Delaware',
    FL: 'Florida',
    GA: 'Georgia',
    HI: 'Hawaii',
    ID: 'Idaho',
    IL: 'Illinois',
    IN: 'Indiana',
    IA: 'Iowa',
    KS: 'Kansas',
    KY: 'Kentucky',
    LA: 'Louisiana',
    ME: 'Maine',
    MD: 'Maryland',
    MA: 'Massachusetts',
    MI: 'Michigan',
    MN: 'Minnesota',
    MS: 'Mississippi',
    MO: 'Missouri',
    MT: 'Montana',
    NE: 'Nebraska',
    NV: 'Nevada',
    NH: 'New Hampshire',
    NJ: 'New Jersey',
    NM: 'New Mexico',
    NY: 'New York',
    NC: 'North Carolina',
    ND: 'North Dakota',
    OH: 'Ohio',
    OK: 'Oklahoma',
    OR: 'Oregon',
    PA: 'Pennsylvania',
    RI: 'Rhode Island',
    SC: 'South Carolina',
    SD: 'South Dakota',
    TN: 'Tennessee',
    TX: 'Texas',
    UT: 'Utah',
    VT: 'Vermont',
    VA: 'Virginia',
    WA: 'Washington',
    WV: 'West Virginia',
    WI: 'Wisconsin',
    WY: 'Wyoming',
    DC: 'District of Columbia',
}

const STATE_NAME_TO_ABBREV = Object.fromEntries(
    Object.entries(STATE_ABBREV_TO_NAME).map(([abbr, name]) => [name, abbr]),
) as Record<string, string>

/** Labels to try when matching POI state names to tile `STATE_NAME`. */
export function stateLabelVariants(state: string): string[] {
    const base = state.trim()
    if (!base) return []

    const variants = new Set<string>([base])
    const upper = base.toUpperCase()
    const fromAbbrev = STATE_ABBREV_TO_NAME[upper]
    if (fromAbbrev) variants.add(fromAbbrev)
    const fromName = STATE_NAME_TO_ABBREV[base]
    if (fromName) variants.add(fromName)

    return [...variants]
}

export function isUnknownCountyLabel(county: string): boolean {
    return county.trim().toLowerCase() === 'unknown county'
}
