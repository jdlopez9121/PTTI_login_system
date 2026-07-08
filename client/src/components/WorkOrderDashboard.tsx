import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type WorkOrderNotification,
  type WorkOrderStatus,
  type WorkOrderTemplate,
  type WorkOrderTicket,
  getArchivedWorkOrderTickets,
  getWorkOrderNotifications,
  getWorkOrderTemplates,
  getWorkOrderTickets,
  markWorkOrderNotificationRead,
} from '../api'
import WorkOrderCreateModal from './WorkOrderCreateModal'
import WorkOrderTemplateManager from './WorkOrderTemplateManager'
import WorkOrderTicketDetail from './WorkOrderTicketDetail'
import WorkOrderWalkthroughVideosPanel from './WorkOrderWalkthroughVideosPanel'
import StudentWalkthroughVideosPanel from './StudentWalkthroughVideosPanel'
import { formatDisplayName } from '../utils/formatName'

type Props = {
  assigneeFilter?: { date?: string; shift?: string }
  onClose: () => void
}

const STATUS_FILTERS: { value: WorkOrderStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'submitted_completed', label: 'Submitted' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const displayStatus = (status: WorkOrderStatus) => status.replace(/_/g, ' ')

function assigneeName(ticket: WorkOrderTicket) {
  if (ticket.assigneeType === 'student' && ticket.assigneeStudent) return formatDisplayName(ticket.assigneeStudent.fullName)
  if (ticket.assigneeType === 'teacher' && ticket.assigneeTeacher) return ticket.assigneeTeacher.name
  return 'Unassigned'
}

export default function WorkOrderDashboard({ assigneeFilter, onClose }: Props) {
  const [templates, setTemplates] = useState<WorkOrderTemplate[]>([])
  const [tickets, setTickets] = useState<WorkOrderTicket[]>([])
  const [notifications, setNotifications] = useState<WorkOrderNotification[]>([])
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | ''>('')
  const [showArchived, setShowArchived] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextTemplates, nextTickets, nextNotifications] = await Promise.all([
        getWorkOrderTemplates(),
        showArchived ? getArchivedWorkOrderTickets(statusFilter) : getWorkOrderTickets(statusFilter),
        getWorkOrderNotifications(false),
      ])
      setTemplates(nextTemplates)
      setTickets(nextTickets)
      setNotifications(nextNotifications)
      if (!selectedTicketId && nextTickets[0]) setSelectedTicketId(nextTickets[0].id)
      if (selectedTicketId && !nextTickets.some((ticket) => ticket.id === selectedTicketId)) setSelectedTicketId(nextTickets[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load work orders')
    } finally {
      setLoading(false)
    }
  }, [selectedTicketId, showArchived, statusFilter])

  useEffect(() => { loadData() }, [loadData])

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [selectedTicketId, tickets],
  )
  const unreadCount = notifications.filter((notification) => !notification.readAt).length

  const mergeTicket = (ticket: WorkOrderTicket) => {
    setTickets((prev) => {
      const exists = prev.some((item) => item.id === ticket.id)
      return exists ? prev.map((item) => item.id === ticket.id ? ticket : item) : [ticket, ...prev]
    })
    setSelectedTicketId(ticket.id)
  }

  const mergeTickets = (nextTickets: WorkOrderTicket[]) => {
    if (nextTickets.length === 0) return
    setTickets((prev) => {
      const nextIds = new Set(nextTickets.map((ticket) => ticket.id))
      return [...nextTickets, ...prev.filter((ticket) => !nextIds.has(ticket.id))]
    })
    setSelectedTicketId(nextTickets[0].id)
  }

  const removeTicket = (ticket?: WorkOrderTicket) => {
    setTickets((prev) => {
      const next = ticket ? prev.filter((item) => item.id !== ticket.id) : prev.filter((item) => item.id !== selectedTicketId)
      setSelectedTicketId(next[0]?.id ?? null)
      return next
    })
  }

  const markRead = async (notification: WorkOrderNotification) => {
    if (!notification.readAt) {
      try {
        await markWorkOrderNotificationRead(notification.id)
        setNotifications((prev) => prev.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to mark notification read')
      }
    }
    setSelectedTicketId(notification.ticketId)
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(1680px, 99vw)', maxHeight: '94vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div>
            <h2>Work Orders</h2>
            <p style={{ color: 'var(--gray-600)', fontSize: '0.82rem', marginTop: '0.15rem' }}>
              Manage templates, assigned tickets, teacher-only activity, and completion notifications.
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Work Order</button>
          <button className="btn btn-secondary" onClick={() => setShowTemplates((v) => !v)}>{showTemplates ? 'Hide Templates' : 'Manage Templates'}</button>
          <button className="btn btn-secondary" onClick={loadData} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button>
          <button className="btn btn-secondary" onClick={() => { setSelectedTicketId(null); setShowArchived((v) => !v) }}>
            {showArchived ? 'Show Active' : 'Show Archived'}
          </button>
          <div className="form-group" style={{ marginBottom: 0, marginLeft: 'auto', minWidth: 150 }}>
            <label style={{ fontSize: '0.75rem' }}>Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as WorkOrderStatus | '')}>
              {STATUS_FILTERS.map((filter) => <option key={filter.value || 'all'} value={filter.value}>{filter.label}</option>)}
            </select>
          </div>
          <span className={`badge ${unreadCount ? 'badge-blue' : 'badge-gray'}`}>{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</span>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
        {showTemplates && <div style={{ marginBottom: '0.75rem', overflow: 'auto', flexShrink: 0, maxHeight: 310 }}><WorkOrderTemplateManager templates={templates} onChanged={loadData} /></div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 0.75fr) minmax(300px, 1.1fr) minmax(230px, 0.8fr) minmax(230px, 0.8fr) minmax(190px, 0.65fr)', gap: '0.75rem', flex: 1, minHeight: 0 }}>
          <section style={{ overflow: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8 }}>
            <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)' }}>
              <h3>Tickets</h3>
            </div>
            {loading ? <p style={{ padding: '1rem', color: 'var(--gray-400)' }}>Loading…</p> : tickets.length === 0 ? (
              <p style={{ padding: '1rem', color: 'var(--gray-500)' }}>No {showArchived ? 'archived ' : ''}work orders match this filter.</p>
            ) : tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setSelectedTicketId(ticket.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '0.75rem', border: 'none', borderBottom: '1px solid var(--gray-200)',
                  background: selectedTicketId === ticket.id ? '#eff6ff' : '#fff', cursor: 'pointer',
                }}
              >
                <strong>{ticket.title}</strong>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.35rem', alignItems: 'center' }}>
                  <span style={{ color: 'var(--gray-600)', fontSize: '0.78rem' }}>{assigneeName(ticket)}</span>
                  <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{displayStatus(ticket.status)}</span>
                </div>
                {ticket.workPerformed && <p style={{ color: 'var(--gray-600)', fontSize: '0.78rem', marginTop: '0.35rem' }}>Work: {ticket.workPerformed.slice(0, 72)}{ticket.workPerformed.length > 72 ? '…' : ''}</p>}
              </button>
            ))}
          </section>

          <section style={{ overflow: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '0.75rem' }}>
            {selectedTicket ? (
              <WorkOrderTicketDetail
                ticketId={selectedTicket.id}
                onChanged={(ticket) => { mergeTicket(ticket); loadData() }}
                onDeleted={(ticket) => { removeTicket(ticket); loadData() }}
              />
            ) : <p style={{ color: 'var(--gray-500)' }}>Select or create a ticket.</p>}
          </section>

          <section style={{ overflow: 'hidden', border: '1px solid var(--gray-200)', borderRadius: 8 }}>
            <WorkOrderWalkthroughVideosPanel />
          </section>

          <section style={{ overflow: 'hidden', border: '1px solid #bbf7d0', borderRadius: 8 }}>
            <StudentWalkthroughVideosPanel />
          </section>

          <section style={{ overflow: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8 }}>
            <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)' }}>
              <h3>Completion Notifications</h3>
            </div>
            {notifications.length === 0 ? <p style={{ padding: '1rem', color: 'var(--gray-500)' }}>No notifications yet.</p> : notifications.map((notification) => (
              <button key={notification.id} type="button" onClick={() => markRead(notification)} style={{ width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--gray-200)', padding: '0.75rem', background: notification.readAt ? '#fff' : '#eff6ff', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>{notification.ticket?.title ?? 'Work order'}</strong>
                  {!notification.readAt && <span className="badge badge-blue">New</span>}
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--gray-700)', marginTop: '0.35rem' }}>{notification.message}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--gray-500)', marginTop: '0.35rem' }}>{new Date(notification.createdAt).toLocaleString()}</p>
              </button>
            ))}
          </section>
        </div>

        {showCreate && (
          <WorkOrderCreateModal
            templates={templates}
            assigneeFilter={assigneeFilter}
            onClose={() => setShowCreate(false)}
            onCreated={(createdTickets) => { setShowCreate(false); mergeTickets(createdTickets); loadData() }}
          />
        )}
      </div>
    </div>
  )
}
