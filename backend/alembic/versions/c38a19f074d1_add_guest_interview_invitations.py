"""add guest interview invitations

Revision ID: c38a19f074d1
Revises: b137a66e92d3
Create Date: 2026-10-17 20:45:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c38a19f074d1'
down_revision: str | Sequence[str] | None = 'b137a66e92d3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Alter user_id to be nullable to support guest/anonymous candidate interview invites
    op.alter_column('interview_sessions', 'user_id',
               existing_type=sa.INTEGER(),
               nullable=True)

    # 2. Add candidate email, status, and direct invitation link columns
    op.add_column('interview_sessions', sa.Column('candidate_email', sa.String(length=255), nullable=True))
    op.add_column('interview_sessions', sa.Column('status', sa.String(length=50), server_default='in_progress', nullable=False))
    op.add_column('interview_sessions', sa.Column('invite_token', sa.String(length=64), nullable=True))
    op.add_column('interview_sessions', sa.Column('invite_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('interview_sessions', sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('interview_sessions', sa.Column('is_anonymous_invite', sa.Boolean(), server_default=sa.text('false'), nullable=False))

    # 3. Create indexes for fast candidate lookup and invite token verification
    op.create_index('ix_interview_sessions_candidate_email', 'interview_sessions', ['candidate_email'], unique=False)
    op.create_index('ix_interview_sessions_invite_token', 'interview_sessions', ['invite_token'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_interview_sessions_invite_token', table_name='interview_sessions')
    op.drop_index('ix_interview_sessions_candidate_email', table_name='interview_sessions')
    op.drop_column('interview_sessions', 'is_anonymous_invite')
    op.drop_column('interview_sessions', 'scheduled_at')
    op.drop_column('interview_sessions', 'invite_expires_at')
    op.drop_column('interview_sessions', 'invite_token')
    op.drop_column('interview_sessions', 'status')
    op.drop_column('interview_sessions', 'candidate_email')
    op.alter_column('interview_sessions', 'user_id',
               existing_type=sa.INTEGER(),
               nullable=False)
