// The SportsDB SOURCE: the client and the normalizer composed into the thing a caller wants.
//
// A caller here asks for "the match" and gets NoaCG-normalized data. It never sees a provider
// field name, and it never learns which endpoint answered. That is the seam a second provider
// slots into later: `createSportsDbSource` is one implementation of "a sports source", and
// nothing above it names TheSportsDB.
//
// Deliberately NOT here: a poller, a scheduler, a cache, a retry loop. A connector is an
// EXTERNAL process that fetches and pushes; the loop belongs to the process, and
// scripts/sportsdb-feed.mjs owns exactly one, in about ten lines.

import { createSportsDbClient } from './client.mjs';
import { SportsDbError } from './errors.mjs';
import { normalizeEvent, normalizeEvents, normalizeTeam, normalizeTeams } from './normalize.mjs';

/**
 * @param {Parameters<typeof createSportsDbClient>[0] & { now?: () => Date }} [options]
 */
export function createSportsDbSource(options = {}) {
  const client = options.client ?? createSportsDbClient(options);
  const clock = options.now ?? (() => new Date());

  /** The stamp every normalized record carries: when THIS process last read the provider. */
  function stamps() {
    const now = clock();
    return { fetchedAt: now, now };
  }

  return {
    client,

    /** One match by provider event id. */
    async event(eventId) {
      return normalizeEvent(await client.lookupEvent(eventId), stamps());
    },

    /** One team by provider team id. */
    async team(teamId) {
      return normalizeTeam(await client.lookupTeam(teamId), stamps());
    },

    /** Teams matching a name. The public test key answers at most one. */
    async searchTeams(name) {
      return normalizeTeams(await client.searchTeams(name), stamps());
    },

    /** The first team matching a name, or a `not_found` error - the "find team" use case. */
    async findTeam(name) {
      const teams = await this.searchTeams(name);
      if (teams.length === 0) throw new SportsDbError('not_found', `No team matching "${name}"`);
      return teams[0];
    },

    /** A team's most recent finished matches, newest first as the provider orders them. */
    async teamLastEvents(teamId) {
      return normalizeEvents(await client.teamLastEvents(teamId), stamps());
    },

    /** A team's upcoming matches. */
    async teamNextEvents(teamId) {
      return normalizeEvents(await client.teamNextEvents(teamId), stamps());
    },

    /** Everything on one day, optionally narrowed to a sport or a league id. */
    async eventsOnDay(date, filter = {}) {
      return normalizeEvents(await client.eventsOnDay(date, filter), stamps());
    },

    /**
     * The match a production most likely wants for a team: the next one if there is one,
     * otherwise the most recent. This is a CONVENIENCE over the two endpoints above - it makes
     * a demo one call instead of three, and it is the only place any "which match" policy
     * lives.
     */
    async currentEventForTeam(teamId) {
      const upcoming = await this.teamNextEvents(teamId);
      if (upcoming.length > 0) return upcoming[0];
      const recent = await this.teamLastEvents(teamId);
      if (recent.length > 0) return recent[0];
      throw new SportsDbError('not_found', `No recent or upcoming events for team ${teamId}`);
    },
  };
}
