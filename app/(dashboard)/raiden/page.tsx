import { getUserTotalBalance, requireUser } from "@/lib/usage/meter";
import { getRaidenConfig } from "@/lib/raiden/settings";
import { raidenActivityKey, raidenActivityWindow } from "@/lib/raiden/config";
import {
  listRaidenLeaderboard,
  listRecentFirstClears,
  myRaidenSummary,
} from "@/lib/raiden/records";
import { RaidenGame } from "@/components/raiden/game";

export const dynamic = "force-dynamic";

export default async function RaidenPage() {
  const userId = await requireUser();
  const [config, balance] = await Promise.all([getRaidenConfig(), getUserTotalBalance(userId)]);
  const windowInfo = raidenActivityWindow(config);
  const activityKey = raidenActivityKey(config);

  const [summary, leaderboard, firstClears] = await Promise.all([
    myRaidenSummary(userId, activityKey),
    activityKey ? listRaidenLeaderboard(activityKey, userId) : Promise.resolve([]),
    activityKey ? listRecentFirstClears(activityKey) : Promise.resolve([]),
  ]);

  const runsLeft = Math.max(0, config.dailyRuns - summary.runsToday);

  return (
    <RaidenGame
      config={config}
      status={windowInfo.status}
      balance={balance.total}
      runsLeft={runsLeft}
      summary={summary}
      leaderboard={leaderboard}
      firstClears={firstClears}
    />
  );
}
