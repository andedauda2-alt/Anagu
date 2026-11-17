import React, { useEffect, useState } from 'react';
import {
  mqttBrokerEngine,
  OFFLINE_QUEUE_STORAGE_KEY,
  OfflineQueueItem,
  oracleEngine,
} from '../core/oracleMqttEngine';
import { syncQueuedOfflineRegistrationsFirestore } from '../core/firestoreCadastre';
import { Wifi, WifiOff, Send, RefreshCw, Database } from 'lucide-react';

interface OracleMqttLabProps {
  onRefresh: () => void;
}

export const OracleMqttLab: React.FC<OracleMqttLabProps> = ({ onRefresh }) => {
  const [isOnline, setIsOnline] = useState<boolean>(mqttBrokerEngine.isOnline);
  const [queuedItems, setQueuedItems] = useState<OfflineQueueItem[]>(() =>
    mqttBrokerEngine.getOfflineQueueItems()
  );
  const [reconnectReport, setReconnectReport] = useState<{
    queuedLocally: boolean | null;
    delivered: boolean | null;
    timeSeconds: number | null;
    syncedCount: number;
  }>(() => ({
    queuedLocally: mqttBrokerEngine.getOfflineQueueCount() > 0 ? true : null,
    delivered: null,
    timeSeconds: null,
    syncedCount: 0,
  }));

  const oracleTestResults = oracleEngine.runBatchOracleTests();
  const [networkBenchmark, setNetworkBenchmark] = useState(mqttBrokerEngine.runDegradedNetworkBenchmark(30));

  useEffect(() => {
    const syncList = () => {
      const items = mqttBrokerEngine.getOfflineQueueItems();
      setQueuedItems(items);
      if (items.length > 0) {
        setReconnectReport((prev) => ({ ...prev, queuedLocally: true }));
      }
    };
    return mqttBrokerEngine.subscribeQueueChanges(syncList);
  }, []);

  const performReconnectFlush = async () => {
    const start = performance.now();
    const telemetryRes = mqttBrokerEngine.flushOfflineQueue();
    const regRes = await syncQueuedOfflineRegistrationsFirestore();
    const totalSynced = telemetryRes.deliveredCount + regRes.syncedCount;
    const elapsedSec = Number(Math.max(0.05, (performance.now() - start) / 1000).toFixed(2));

    if (totalSynced > 0 || regRes.failedCount > 0) {
      setReconnectReport({
        queuedLocally: true,
        delivered: totalSynced > 0 && regRes.failedCount === 0,
        timeSeconds: elapsedSec,
        syncedCount: totalSynced,
      });
    }
    setQueuedItems(mqttBrokerEngine.getOfflineQueueItems());
    onRefresh();
  };

  const toggleNetworkConnection = async () => {
    const nextState = !isOnline;
    mqttBrokerEngine.isOnline = nextState;
    setIsOnline(nextState);

    if (nextState && mqttBrokerEngine.getOfflineQueueCount() > 0) {
      await performReconnectFlush();
    } else {
      onRefresh();
    }
  };

  const handleQueueSimulatedOfflineSubmission = () => {
    mqttBrokerEngine.queueOfflineSubmission({
      id: 'OFFLINE-CAD-' + Math.floor(100 + Math.random() * 900),
      applicantName: 'Musa Abdullahi (Field Surveyor)',
      locationName: 'Remote Agricultural Sector Zone R4',
    });
    setQueuedItems(mqttBrokerEngine.getOfflineQueueItems());
    setReconnectReport({
      queuedLocally: true,
      delivered: false,
      timeSeconds: null,
      syncedCount: 0,
    });
  };

  const handleRerunNetworkBenchmark = () => {
    const res = mqttBrokerEngine.runDegradedNetworkBenchmark(30);
    setNetworkBenchmark(res);
  };

  const topicSchemas = [
    {
      topic: 'land/registration/status',
      qos: 1,
      fields: '{ applicationId, titleNumber, status, timestamp }',
      sampleBytes: JSON.stringify({
        applicationId: 'PARCEL-NG-001',
        titleNumber: 'NG-ABJ-2025-0104',
        status: 'SUBMITTED',
        timestamp: 1714567890000,
      }).length,
    },
    {
      topic: 'land/spatial/cadastre',
      qos: 1,
      fields: '{ applicationId, status, spatialHash, areaSqm }',
      sampleBytes: JSON.stringify({
        applicationId: 'PARCEL-NG-001',
        status: 'SPATIAL_VERIFIED',
        spatialHash: '0x8f7a932b...c9e',
        areaSqm: 308640,
      }).length,
    },
    {
      topic: 'land/nft/issued',
      qos: 1,
      fields: '{ tokenId, titleNumber, owner, txHash, spatialHash, timestamp }',
      sampleBytes: JSON.stringify({
        tokenId: 1001,
        titleNumber: 'NG-ABJ-2025-0104',
        owner: '0x104b...ac93',
        txHash: '0x992b...6a8b',
        spatialHash: '0x8f7a...c9e',
        timestamp: 1714567990000,
      }).length,
    },
    {
      topic: 'land/revocation/alert',
      qos: 1,
      fields: '{ tokenId, parcelId, titleNumber, ground, revokedBy, txHash, timestamp }',
      sampleBytes: JSON.stringify({
        tokenId: 1001,
        parcelId: 'PARCEL-NG-001',
        titleNumber: 'NG-ABJ-2025-0104',
        ground: 'OverridingPublicInterest',
        revokedBy: '0x888...888',
        txHash: '0x777...c2e',
        timestamp: 1714568190000,
      }).length,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-[22px] text-[#0F172A]">
            Community Verification Oracle &amp; MQTT Sync
          </h2>
          <p className="text-[13px] text-[#475569] mt-0.5">
            Reconciliation of statutory and customary tenure claims with offline-first telemetry queueing.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-[#F8FAFC] px-4 py-2 rounded-lg border border-[#E2E8F0]">
          <span className="text-[12px] text-[#475569]">Network state:</span>
          <button
            type="button"
            onClick={toggleNetworkConnection}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              isOnline ? 'bg-[#059669] hover:bg-[#047857] text-white' : 'bg-[#D97706] hover:bg-[#B45309] text-white'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'Online' : 'Offline mode'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0F172A]">
              Ownership Verification Test Results
            </h3>
            <p className="text-[13px] text-[#475569]">
              Dual reconciliation: Institutional Land Registry vs. Customary Traditional Council
            </p>
          </div>
          <span className="text-[12px] font-mono tabular-nums text-[#64748B]">
            N = {oracleTestResults.summary.total}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-7">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[12px]">
                  <th className="py-2.5 px-3 font-medium">Verification Outcome</th>
                  <th className="py-2.5 px-3 text-right font-medium">Frequency</th>
                  <th className="py-2.5 px-3 text-right font-medium">Percentage [%]</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                <tr className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-3 text-[#059669] font-medium">Successfully verified</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#059669] font-semibold">
                    {oracleTestResults.summary.verifiedCount}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#475569]">
                    {oracleTestResults.summary.verifiedPct.toFixed(1)}%
                  </td>
                </tr>
                <tr className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-3 text-[#334155]">Incomplete supporting documents</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#475569]">
                    {oracleTestResults.summary.incompleteCount}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#475569]">
                    {oracleTestResults.summary.incompletePct.toFixed(1)}%
                  </td>
                </tr>
                <tr className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-3 text-[#DC2626] font-medium">Ownership information conflict</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#DC2626] font-semibold">
                    {oracleTestResults.summary.conflictCount}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#475569]">
                    {oracleTestResults.summary.conflictPct.toFixed(1)}%
                  </td>
                </tr>
                <tr className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-3 text-[#D97706] font-medium">Legal verification pending</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#D97706] font-semibold">
                    {oracleTestResults.summary.pendingCount}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#475569]">
                    {oracleTestResults.summary.pendingPct.toFixed(1)}%
                  </td>
                </tr>
                <tr className="border-t border-[#CBD5E1] font-semibold bg-[#F8FAFC]">
                  <td className="py-2.5 px-3 text-[#0F172A]">Total [N]</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#0F172A]">
                    {oracleTestResults.summary.total}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#059669]">100%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="md:col-span-5 bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] space-y-2.5 text-[12.5px]">
            <span className="font-semibold text-[#0F172A] block">
              Reconciliation Match vs. Conflict Rules
            </span>
            <ul className="text-[#475569] space-y-2 list-disc list-inside leading-relaxed">
              <li>
                <strong className="text-[#059669]">Match:</strong> Statutory Deeds volume matches registered owner,
                Customary Clan Elder assent is signed without caveats, and cryptographic seal validates.
              </li>
              <li>
                <strong className="text-[#DC2626]">Conflict:</strong> Deed registered to a different entity, or elders
                report inter-family lineage contestation.
              </li>
              <li>
                <strong className="text-[#D97706]">Pending:</strong> Active High Court litigation caveat on folio.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
          <h3 className="text-[14px] font-semibold text-[#0F172A] border-b border-[#F1F5F9] pb-2.5">
            MQTT Topic &amp; Payload Schema
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px] border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B]">
                  <th className="py-2 px-2 font-medium">Topic</th>
                  <th className="py-2 px-2 font-medium">Payload Fields</th>
                  <th className="py-2 px-2 text-center font-medium">QoS</th>
                  <th className="py-2 px-2 text-right font-medium">Bytes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] font-mono">
                {topicSchemas.map((s, idx) => (
                  <tr key={idx} className="hover:bg-[#F8FAFC]">
                    <td className="py-2 px-2 text-[#2563EB] font-medium">{s.topic}</td>
                    <td className="py-2 px-2 text-[#475569] truncate max-w-[140px]" title={s.fields}>
                      {s.fields}
                    </td>
                    <td className="py-2 px-2 text-center text-[#0F172A]">{s.qos}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-[#64748B]">{s.sampleBytes} B</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-2.5">
            <h3 className="text-[14px] font-semibold text-[#0F172A]">
              MQTT Delivery Performance by Condition
            </h3>
            <button
              type="button"
              onClick={handleRerunNetworkBenchmark}
              className="text-[12px] text-[#2563EB] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Rerun (N=30)</span>
            </button>
          </div>

          <table className="w-full text-left text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[12px]">
                <th className="py-2 px-2 font-medium">Condition</th>
                <th className="py-2 px-2 text-center font-medium">Sent</th>
                <th className="py-2 px-2 text-center font-medium">Delivered</th>
                <th className="py-2 px-2 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              <tr className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#0F172A]">Normal connectivity</td>
                <td className="py-2.5 px-2 text-center font-mono tabular-nums text-[#64748B]">
                  {networkBenchmark.normal.sent}
                </td>
                <td className="py-2.5 px-2 text-center font-mono tabular-nums text-[#059669] font-medium">
                  {networkBenchmark.normal.delivered}
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#059669] font-semibold">
                  {networkBenchmark.normal.rate.toFixed(1)}%
                </td>
              </tr>
              <tr className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#0F172A]">Moderate degradation (200ms / 10% loss)</td>
                <td className="py-2.5 px-2 text-center font-mono tabular-nums text-[#64748B]">
                  {networkBenchmark.moderate.sent}
                </td>
                <td className="py-2.5 px-2 text-center font-mono tabular-nums text-[#2563EB] font-medium">
                  {networkBenchmark.moderate.delivered}
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#2563EB] font-semibold">
                  {networkBenchmark.moderate.rate.toFixed(1)}%
                </td>
              </tr>
              <tr className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#0F172A]">Severe degradation (500ms / 25% loss)</td>
                <td className="py-2.5 px-2 text-center font-mono tabular-nums text-[#64748B]">
                  {networkBenchmark.severe.sent}
                </td>
                <td className="py-2.5 px-2 text-center font-mono tabular-nums text-[#D97706] font-medium">
                  {networkBenchmark.severe.delivered}
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#D97706] font-semibold">
                  {networkBenchmark.severe.rate.toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F5F9] pb-3">
          <div>
            <h3 className="text-[14px] font-semibold text-[#0F172A]">
              Offline Queue &amp; Reconnect Sync (<code className="font-mono text-[12px]">localStorage</code>)
            </h3>
            <p className="text-[13px] text-[#475569]">
              Low-connectivity capture stored in{' '}
              <code className="font-mono text-[11.5px] text-[#0F172A]">{OFFLINE_QUEUE_STORAGE_KEY}</code> with
              automatic flushing on reconnect
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isOnline && (
              <button
                type="button"
                onClick={handleQueueSimulatedOfflineSubmission}
                className="px-3.5 py-2 bg-[#D97706] hover:bg-[#B45309] text-white rounded-lg text-[12px] font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Queue Offline Field Submission ({queuedItems.length} in localStorage)</span>
              </button>
            )}

            {isOnline && queuedItems.length > 0 && (
              <button
                type="button"
                onClick={performReconnectFlush}
                className="px-3.5 py-2 bg-[#059669] hover:bg-[#047857] text-white rounded-lg text-[12px] font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Flush {queuedItems.length} Queued Item(s) Now</span>
              </button>
            )}
          </div>
        </div>

        <table className="w-full text-left text-[13px] border-collapse">
          <thead>
            <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[12px]">
              <th className="py-2.5 px-3 font-medium">Scenario</th>
              <th className="py-2.5 px-3 text-right font-medium">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            <tr className="hover:bg-[#F8FAFC]">
              <td className="py-2.5 px-3 text-[#0F172A]">Submission made while offline is queued in localStorage</td>
              <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#059669]">
                {reconnectReport.queuedLocally === null
                  ? 'Awaiting offline test'
                  : reconnectReport.queuedLocally
                  ? `Yes (${queuedItems.length} currently queued)`
                  : 'No'}
              </td>
            </tr>
            <tr className="hover:bg-[#F8FAFC]">
              <td className="py-2.5 px-3 text-[#0F172A]">Queued submission is delivered after reconnect</td>
              <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#059669]">
                {reconnectReport.delivered === null
                  ? 'Awaiting reconnect sync'
                  : reconnectReport.delivered
                  ? `Yes (${reconnectReport.syncedCount} synced)`
                  : 'Pending reconnect'}
              </td>
            </tr>
            <tr className="hover:bg-[#F8FAFC]">
              <td className="py-2.5 px-3 text-[#0F172A]">Time from reconnect to successful delivery</td>
              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#059669] font-semibold">
                {reconnectReport.timeSeconds !== null ? `${reconnectReport.timeSeconds} seconds` : '—'}
              </td>
            </tr>
          </tbody>
        </table>

        {queuedItems.length > 0 && (
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[12px] text-[#475569]">
              <span className="font-medium flex items-center gap-1.5 text-[#0F172A]">
                <Database className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Live localStorage Queue Snapshot ({OFFLINE_QUEUE_STORAGE_KEY})</span>
              </span>
              <span className="font-mono">{queuedItems.length} item(s)</span>
            </div>
            <pre className="text-[11px] font-mono text-[#334155] overflow-x-auto max-h-40 bg-white p-2.5 rounded border border-[#E2E8F0]">
              {JSON.stringify(
                queuedItems.map((i) => ({
                  id: i.id,
                  kind: i.kind,
                  applicantName: i.parcelData.applicantName,
                  locationName: i.parcelData.locationName,
                  queuedAt: new Date(i.queuedAt).toISOString(),
                })),
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
