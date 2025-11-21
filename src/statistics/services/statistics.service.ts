import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Match, MatchDocument } from '../../database/schemas/match.schema';

export interface TeamStats {
  teamId: string;
  teamName: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  homeRecord: {
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
  };
  awayRecord: {
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
  };
  pointsPerGame: number;
  goalsPerGame: number;
}

export interface FormData {
  form: string[]; // Last 5 matches: 'W', 'D', 'L'
  points: number; // Points from last 5 matches
  streak: string; // 'winning', 'losing', 'drawing', 'none'
}

export interface HeadToHeadRecord {
  team1: string;
  team2: string;
  team1Wins: number;
  team2Wins: number;
  draws: number;
  team1AvgGoals: number;
  team2AvgGoals: number;
}

export interface WeatherImpact {
  weatherType: string;
  matchCount: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  winRate: number;
  avgGoals: number;
}

export interface ChartData {
  leagueTable: Array<{
    team: string;
    points: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    wins: number;
    draws: number;
    losses: number;
  }>;
  form: {
    [teamName: string]: FormData;
  };
  headToHead: Array<{
    team1: string;
    team2: string;
    team1Wins: number;
    team2Wins: number;
    draws: number;
  }>;
  weatherImpact: Array<{
    weather: string;
    matches: number;
    winRate: number;
    avgGoals: number;
  }>;
}

@Injectable()
export class StatisticsService {
  private readonly logger = new Logger(StatisticsService.name);

  constructor(
    @InjectModel(Match.name) private matchModel: Model<MatchDocument>,
  ) {}

  /**
   * Formats season string based on league
   * MLS (4346): "2025" -> "2025"
   * La Liga (4335): "2025" -> "2025-2026"
   */
  formatSeason(year: string, leagueId: number): string {
    if (leagueId === 4346) {
      // MLS: Single year format
      return year;
    } else if (leagueId === 4335) {
      // La Liga: YYYY-YYYY+1 format
      const yearNum = parseInt(year, 10);
      const nextYear = yearNum + 1;
      return `${year}-${nextYear}`;
    }
    throw new Error(`Unsupported leagueId: ${leagueId}`);
  }

  /**
   * Fetches completed matches for a season and league
   */
  async fetchCompletedMatches(
    season: string,
    leagueId: number,
  ): Promise<Match[]> {
    const matches = await this.matchModel
      .find({
        strSeason: season,
        idLeague: leagueId.toString(),
        strStatus: 'Match Finished',
      })
      .sort({ dateEvent: 1, strTimestamp: 1 }) // Chronological order
      .lean<Match[]>()
      .exec();

    this.logger.log(
      `[STATISTICS] Fetched ${matches.length} completed matches for season ${season}, league ${leagueId}`,
    );

    return matches;
  }

  /**
   * Parses score string to number, handling null/undefined
   */
  private parseScore(score: string | undefined): number {
    if (!score) return 0;
    const parsed = parseInt(score, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Calculates comprehensive team statistics
   */
  calculateTeamStatistics(matches: Match[]): Map<string, TeamStats> {
    const teamStatsMap = new Map<string, TeamStats>();

    for (const match of matches) {
      const homeScore = this.parseScore(match.intHomeScore);
      const awayScore = this.parseScore(match.intAwayScore);

      // Skip matches without valid scores
      if (homeScore === 0 && awayScore === 0) {
        continue;
      }

      // Process home team
      const homeTeamId = match.idHomeTeam;
      const homeTeamName = match.strHomeTeam;

      if (!teamStatsMap.has(homeTeamId)) {
        teamStatsMap.set(homeTeamId, {
          teamId: homeTeamId,
          teamName: homeTeamName,
          matchesPlayed: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          homeRecord: {
            matches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
          },
          awayRecord: {
            matches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
          },
          pointsPerGame: 0,
          goalsPerGame: 0,
        });
      }

      const homeStats = teamStatsMap.get(homeTeamId)!;
      homeStats.matchesPlayed++;
      homeStats.goalsFor += homeScore;
      homeStats.goalsAgainst += awayScore;
      homeStats.homeRecord.matches++;
      homeStats.homeRecord.goalsFor += homeScore;
      homeStats.homeRecord.goalsAgainst += awayScore;

      if (homeScore > awayScore) {
        homeStats.wins++;
        homeStats.points += 3;
        homeStats.homeRecord.wins++;
      } else if (homeScore < awayScore) {
        homeStats.losses++;
        homeStats.homeRecord.losses++;
      } else {
        homeStats.draws++;
        homeStats.points += 1;
        homeStats.homeRecord.draws++;
      }

      // Process away team
      const awayTeamId = match.idAwayTeam;
      const awayTeamName = match.strAwayTeam;

      if (!teamStatsMap.has(awayTeamId)) {
        teamStatsMap.set(awayTeamId, {
          teamId: awayTeamId,
          teamName: awayTeamName,
          matchesPlayed: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          homeRecord: {
            matches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
          },
          awayRecord: {
            matches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
          },
          pointsPerGame: 0,
          goalsPerGame: 0,
        });
      }

      const awayStats = teamStatsMap.get(awayTeamId)!;
      awayStats.matchesPlayed++;
      awayStats.goalsFor += awayScore;
      awayStats.goalsAgainst += homeScore;
      awayStats.awayRecord.matches++;
      awayStats.awayRecord.goalsFor += awayScore;
      awayStats.awayRecord.goalsAgainst += homeScore;

      if (awayScore > homeScore) {
        awayStats.wins++;
        awayStats.points += 3;
        awayStats.awayRecord.wins++;
      } else if (awayScore < homeScore) {
        awayStats.losses++;
        awayStats.awayRecord.losses++;
      } else {
        awayStats.draws++;
        awayStats.points += 1;
        awayStats.awayRecord.draws++;
      }
    }

    // Calculate derived stats
    for (const stats of teamStatsMap.values()) {
      stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
      stats.pointsPerGame =
        stats.matchesPlayed > 0 ? stats.points / stats.matchesPlayed : 0;
      stats.goalsPerGame =
        stats.matchesPlayed > 0 ? stats.goalsFor / stats.matchesPlayed : 0;
    }

    return teamStatsMap;
  }

  /**
   * Calculates form (last 5 matches) for each team
   */
  calculateForm(matches: Match[]): Map<string, FormData> {
    const teamFormMap = new Map<string, FormData>();
    const teamMatchesMap = new Map<string, Match[]>();

    // Group matches by team
    for (const match of matches) {
      const homeTeamId = match.idHomeTeam;
      const awayTeamId = match.idAwayTeam;

      if (!teamMatchesMap.has(homeTeamId)) {
        teamMatchesMap.set(homeTeamId, []);
      }
      if (!teamMatchesMap.has(awayTeamId)) {
        teamMatchesMap.set(awayTeamId, []);
      }

      teamMatchesMap.get(homeTeamId)!.push(match);
      teamMatchesMap.get(awayTeamId)!.push(match);
    }

    // Calculate form for each team
    for (const [teamId, teamMatches] of teamMatchesMap.entries()) {
      // Sort by date (most recent first) and take last 5
      const sortedMatches = [...teamMatches].sort(
        (a, b) =>
          new Date(b.dateEvent).getTime() - new Date(a.dateEvent).getTime(),
      );
      const last5Matches = sortedMatches.slice(0, 5).reverse(); // Reverse to get chronological order

      const form: string[] = [];
      let points = 0;
      let streakType = 'none';
      let streakCount = 0;

      for (const match of last5Matches) {
        const homeScore = this.parseScore(match.intHomeScore);
        const awayScore = this.parseScore(match.intAwayScore);
        const isHome = match.idHomeTeam === teamId;

        if (isHome) {
          if (homeScore > awayScore) {
            form.push('W');
            points += 3;
            if (streakType === 'winning') streakCount++;
            else {
              streakType = 'winning';
              streakCount = 1;
            }
          } else if (homeScore < awayScore) {
            form.push('L');
            if (streakType === 'losing') streakCount++;
            else {
              streakType = 'losing';
              streakCount = 1;
            }
          } else {
            form.push('D');
            points += 1;
            if (streakType === 'drawing') streakCount++;
            else {
              streakType = 'drawing';
              streakCount = 1;
            }
          }
        } else {
          if (awayScore > homeScore) {
            form.push('W');
            points += 3;
            if (streakType === 'winning') streakCount++;
            else {
              streakType = 'winning';
              streakCount = 1;
            }
          } else if (awayScore < homeScore) {
            form.push('L');
            if (streakType === 'losing') streakCount++;
            else {
              streakType = 'losing';
              streakCount = 1;
            }
          } else {
            form.push('D');
            points += 1;
            if (streakType === 'drawing') streakCount++;
            else {
              streakType = 'drawing';
              streakCount = 1;
            }
          }
        }
      }

      // Get team name
      const teamName =
        last5Matches.length > 0
          ? last5Matches[0].idHomeTeam === teamId
            ? last5Matches[0].strHomeTeam
            : last5Matches[0].strAwayTeam
          : 'Unknown';

      teamFormMap.set(teamName, {
        form,
        points,
        streak: streakCount > 1 ? streakType : 'none',
      });
    }

    return teamFormMap;
  }

  /**
   * Calculates head-to-head records between teams
   */
  calculateHeadToHead(matches: Match[]): HeadToHeadRecord[] {
    const h2hMap = new Map<string, HeadToHeadRecord>();

    for (const match of matches) {
      const homeTeamId = match.idHomeTeam;
      const awayTeamId = match.idAwayTeam;
      const homeScore = this.parseScore(match.intHomeScore);
      const awayScore = this.parseScore(match.intAwayScore);

      // Create unique key for team pair (always sorted)
      const teamPair = [homeTeamId, awayTeamId].sort().join('-');
      const team1 = homeTeamId < awayTeamId ? homeTeamId : awayTeamId;
      const team2 = homeTeamId < awayTeamId ? awayTeamId : homeTeamId;

      if (!h2hMap.has(teamPair)) {
        const team1Name =
          homeTeamId < awayTeamId ? match.strHomeTeam : match.strAwayTeam;
        const team2Name =
          homeTeamId < awayTeamId ? match.strAwayTeam : match.strHomeTeam;
        h2hMap.set(teamPair, {
          team1: team1Name,
          team2: team2Name,
          team1Wins: 0,
          team2Wins: 0,
          draws: 0,
          team1AvgGoals: 0,
          team2AvgGoals: 0,
        });
      }

      const h2h = h2hMap.get(teamPair)!;
      const team1IsHome = team1 === homeTeamId;

      if (homeScore > awayScore) {
        if (team1IsHome) h2h.team1Wins++;
        else h2h.team2Wins++;
      } else if (awayScore > homeScore) {
        if (team1IsHome) h2h.team2Wins++;
        else h2h.team1Wins++;
      } else {
        h2h.draws++;
      }

      // Track goals for average calculation
      const totalMatches = h2h.team1Wins + h2h.team2Wins + h2h.draws;
      if (team1IsHome) {
        h2h.team1AvgGoals =
          (h2h.team1AvgGoals * (totalMatches - 1) + homeScore) / totalMatches;
        h2h.team2AvgGoals =
          (h2h.team2AvgGoals * (totalMatches - 1) + awayScore) / totalMatches;
      } else {
        h2h.team1AvgGoals =
          (h2h.team1AvgGoals * (totalMatches - 1) + awayScore) / totalMatches;
        h2h.team2AvgGoals =
          (h2h.team2AvgGoals * (totalMatches - 1) + homeScore) / totalMatches;
      }
    }

    return Array.from(h2hMap.values());
  }

  /**
   * Analyzes weather impact on match outcomes
   */
  analyzeWeatherImpact(matches: Match[]): WeatherImpact[] {
    const weatherMap = new Map<string, WeatherImpact>();

    for (const match of matches) {
      if (!match.weatherAtMatchTime?.weather) {
        continue;
      }

      const weatherType = match.weatherAtMatchTime.weather;
      const homeScore = this.parseScore(match.intHomeScore);
      const awayScore = this.parseScore(match.intAwayScore);
      const totalGoals = homeScore + awayScore;

      if (!weatherMap.has(weatherType)) {
        weatherMap.set(weatherType, {
          weatherType,
          matchCount: 0,
          homeWins: 0,
          awayWins: 0,
          draws: 0,
          winRate: 0,
          avgGoals: 0,
        });
      }

      const weather = weatherMap.get(weatherType)!;
      weather.matchCount++;
      weather.avgGoals =
        (weather.avgGoals * (weather.matchCount - 1) + totalGoals) /
        weather.matchCount;

      if (homeScore > awayScore) {
        weather.homeWins++;
      } else if (awayScore > homeScore) {
        weather.awayWins++;
      } else {
        weather.draws++;
      }

      weather.winRate =
        weather.matchCount > 0
          ? (weather.homeWins + weather.awayWins) / weather.matchCount
          : 0;
    }

    return Array.from(weatherMap.values());
  }

  /**
   * Formats statistics data for chart libraries (Recharts format)
   */
  formatForCharts(
    teamStats: Map<string, TeamStats>,
    formData: Map<string, FormData>,
    h2hRecords: HeadToHeadRecord[],
    weatherImpact: WeatherImpact[],
  ): ChartData {
    // League Table - sorted by points, then goal difference
    const leagueTable = Array.from(teamStats.values())
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.goalDifference - a.goalDifference;
      })
      .map((stats) => ({
        team: stats.teamName,
        points: stats.points,
        goalsFor: stats.goalsFor,
        goalsAgainst: stats.goalsAgainst,
        goalDifference: stats.goalDifference,
        wins: stats.wins,
        draws: stats.draws,
        losses: stats.losses,
      }));

    // Form data
    const form: { [teamName: string]: FormData } = {};
    for (const [teamName, formInfo] of formData.entries()) {
      form[teamName] = formInfo;
    }

    // Head-to-head (simplified for charts)
    const headToHead = h2hRecords.map((h2h) => ({
      team1: h2h.team1,
      team2: h2h.team2,
      team1Wins: h2h.team1Wins,
      team2Wins: h2h.team2Wins,
      draws: h2h.draws,
    }));

    // Weather impact
    const weatherImpactChart = weatherImpact.map((weather) => ({
      weather: weather.weatherType,
      matches: weather.matchCount,
      winRate: weather.winRate,
      avgGoals: weather.avgGoals,
    }));

    return {
      leagueTable,
      form,
      headToHead,
      weatherImpact: weatherImpactChart,
    };
  }

  /**
   * Main method: Gets comprehensive statistics for a year and league
   */
  async getYearStatistics(
    year: string,
    leagueId: number,
  ): Promise<ChartData & { rawStats: TeamStats[] }> {
    // Format season based on league
    const season = this.formatSeason(year, leagueId);

    // Fetch completed matches
    const matches = await this.fetchCompletedMatches(season, leagueId);

    if (matches.length === 0) {
      this.logger.warn(
        `[STATISTICS] No completed matches found for season ${season}, league ${leagueId}`,
      );
      return {
        leagueTable: [],
        form: {},
        headToHead: [],
        weatherImpact: [],
        rawStats: [],
      };
    }

    // Calculate all statistics
    const teamStats = this.calculateTeamStatistics(matches);
    const formData = this.calculateForm(matches);
    const h2hRecords = this.calculateHeadToHead(matches);
    const weatherImpact = this.analyzeWeatherImpact(matches);

    // Format for charts
    const chartData = this.formatForCharts(
      teamStats,
      formData,
      h2hRecords,
      weatherImpact,
    );

    // Include raw stats for additional processing if needed
    const rawStats = Array.from(teamStats.values()).sort(
      (a, b) => b.points - a.points,
    );

    return {
      ...chartData,
      rawStats,
    };
  }
}

