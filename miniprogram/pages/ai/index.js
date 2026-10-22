const { syncRoleBar } = require('../../utils/role')
const { requireLogin } = require('../../utils/guard')
const aiApi = require('../../services/aiApi')
const config = require('../../config')

const CONCLUSION_LABEL = {
  no_obvious: '未见明显特征',
  needs_attention: '疑似需关注',
  unable_to_judge: '无法判断'
}

Page({
  data: {
    role: 'student',
    taskLabels: { queued: '等待处理', running: '处理中', succeeded: '已完成', failed: '未完成', partial: '部分完成', need_retake: '请补充照片', draft: '待复核', reviewed: '已复核', pending: '待处理', submitted: '已提交', cancelled: '已取消' },
    providerInfo: null,
    realProviderReady: false,
    mode: 'real',
    frontMediaId: '',
    sideMediaId: '',
    postureTask: null,
    postureReport: null,
    goalTask: null,
    goalGroup: null,
    consultations: [],
    busy: false,
    statusHint: ''
  },

  onShow() {
    if (!requireLogin(this)) return
    syncRoleBar(this)
    const coach = getApp().globalData.role === 'coach'
    wx.setNavigationBarTitle({ title: coach ? 'AI工具' : 'AI助手' })
    this.refreshMeta()
    this.loadConsultations()
  },

  refreshMeta() {
    aiApi
      .providers()
      .then((info) => {
        const active = (info && info.active) || 'unavailable'
        const ready = active === 'mock' || active === 'demo'
        this.setData({
          providerInfo: info,
          realProviderReady: ready,
          statusHint: ready
            ? '真实通道：本地 mock 已启用'
            : '真实通道未接入：提交将失败，不会显示成功'
        })
      })
      .catch(() => {
        this.setData({
          realProviderReady: false,
          statusHint: '无法读取 AI 能力状态，请确认 API 已启动'
        })
      })
  },

  onModeChange(e) {
    const mode = e.detail.value
    this.setData({
      mode,
      postureTask: null,
      postureReport: null,
      goalTask: null,
      goalGroup: null,
      statusHint:
        mode === 'demo'
          ? '演示模式：结果带 DEMO 标记，与真实任务隔离'
          : this.data.realProviderReady
            ? '真实模式：将调用已配置供应商'
            : '真实模式：未接入能力不得显示成功'
    })
  },

  onFoodCamera() { wx.navigateTo({url:'/pages/food-photo/index?source=camera'}) },

  onFoodAlbum() { wx.navigateTo({url:'/pages/food-photo/index?source=album'}) },

  async onPickFront() {
    await this.pickView('front')
  },

  async onPickSide() {
    await this.pickView('side')
  },

  async pickView(view) {
    const app = getApp()
    if (this.data.mode === 'demo') {
      try {
        this.setData({ busy: true })
        const asset = await aiApi.demoUploadPhoto('posture_input', {
          view,
          person_count: 1,
          has_front: view === 'front',
          has_side: view === 'side'
        })
        if (view === 'front') this.setData({ frontMediaId: asset.media_id })
        else this.setData({ sideMediaId: asset.media_id })
        app.toast(view === 'front' ? '已登记正面（演示）' : '已登记侧面（演示）')
      } catch (e) {
        app.toast((e && e.message) || '上传失败')
      } finally {
        this.setData({ busy: false })
      }
      return
    }

    // 真实：引导选图后走 upload-intent（本地无对象存储时仅完成登记）
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        try {
          this.setData({ busy: true })
          const intent = await aiApi.createUploadIntent({
            purpose: 'posture_input',
            mime: 'image/jpeg',
            size: file.size || 100000,
            is_demo: false
          })
          const asset = await aiApi.completeUpload(intent.media_id, {
            quality: {
              view,
              person_count: 1,
              has_front: view === 'front',
              has_side: view === 'side'
            }
          })
          if (view === 'front') this.setData({ frontMediaId: asset.media_id })
          else this.setData({ sideMediaId: asset.media_id })
          app.toast('已上传登记')
        } catch (e) {
          app.toast((e && e.message) || '上传失败')
        } finally {
          this.setData({ busy: false })
        }
      }
    })
  },

  async onScan() {
    const app = getApp()
    if (this.data.busy) return
    if (!this.data.frontMediaId && this.data.mode === 'real') {
      app.toast('请先上传正面照片')
      return
    }

    const mode = this.data.mode
    if (mode === 'real' && !this.data.realProviderReady) {
      wx.showModal({
        title: '能力未接入',
        content:
          '真实体态分析尚未配置供应商。不会显示成功结果。可切换「演示」查看流程，或配置 AI_PROVIDER=mock。',
        showCancel: false
      })
    }

    this.setData({ busy: true, postureTask: null, postureReport: null })
    try {
      const task = await aiApi.createAiTask(
        {
          type: 'posture_scan',
          mode,
          consent_confirmed: true,
          input: {
            front_media_id: this.data.frontMediaId || undefined,
            side_media_id: this.data.sideMediaId || undefined,
            // 缺侧面时服务端返回 need_retake（AC26）
            quality_hints: {
              has_front: !!this.data.frontMediaId,
              has_side: !!this.data.sideMediaId,
              person_count: 1
            }
          }
        },
        'posture_' + mode + '_' + Date.now()
      )

      this.setData({ postureTask: task })

      if (task.status === 'need_retake') {
        const reasons = ((task.result && task.result.quality && task.result.quality.reasons) || []).join(
          '、'
        )
        wx.showModal({
          title: '需要重拍',
          content: reasons || '请补充侧面或改善拍摄条件，不返回默认正常报告',
          showCancel: false
        })
        return
      }

      if (task.status === 'failed') {
        wx.showModal({
          title: '任务未成功',
          content: (task.error && task.error.message) || '分析失败',
          showCancel: false
        })
        return
      }

      if (task.status === 'succeeded' && task.result && task.result.report_id) {
        const report = await aiApi.getPostureReport(task.result.report_id)
        this.setData({
          postureReport: this.formatReport(report)
        })
        if (report.is_demo) {
          app.toast('演示报告已生成（非真实评估）')
        } else {
          app.toast('报告已生成（待教练复核）')
        }
      }
    } catch (e) {
      wx.showModal({
        title: '提交失败',
        content: (e && e.message) || '无法创建任务',
        showCancel: false
      })
    } finally {
      this.setData({ busy: false })
    }
  },

  formatReport(report) {
    const items = (report.items || []).map((it) =>
      Object.assign({}, it, {
        conclusion_label: CONCLUSION_LABEL[it.conclusion] || it.conclusion
      })
    )
    return Object.assign({}, report, { items, overall_score: null })
  },

  async onGoalGenerate() {
    const app = getApp()
    if (this.data.busy) return
    const mode = this.data.mode
    if (mode === 'real' && !this.data.realProviderReady) {
      wx.showModal({
        title: '能力未接入',
        content: '真实目标图尚未接入，不会显示成功。可切换演示模式。',
        showCancel: false
      })
    }

    this.setData({ busy: true, goalTask: null, goalGroup: null })
    try {
      let sourceId = this.data.frontMediaId
      if (!sourceId && mode === 'demo') {
        const asset = await aiApi.demoUploadPhoto('goal_source', { person_count: 1 })
        sourceId = asset.media_id
        this.setData({ frontMediaId: sourceId })
      }
      if (!sourceId) {
        app.toast('请先准备本人照片')
        return
      }

      const task = await aiApi.createAiTask(
        {
          type: 'goal_image',
          mode,
          consent_confirmed: true,
          input: {
            source_media_id: sourceId,
            goal_text: '体态与线条改善（用户表述，非成果保证）',
            nodes: [
              { key: 'm2', months: 2 },
              { key: 'm3', months: 3 },
              { key: 'm6', months: 6 }
            ],
            // 演示：故意让一节点失败，验证 AC28 单节点重试
            fail_nodes: mode === 'demo' ? ['m6'] : []
          }
        },
        'goal_' + mode + '_' + Date.now()
      )

      this.setData({ goalTask: task })
      if (task.result && task.result.group_id) {
        const group = await aiApi.getGoalGroup(task.result.group_id)
        this.setData({ goalGroup: group })
      }

      if (task.status === 'failed') {
        wx.showModal({
          title: '目标图未成功',
          content: (task.error && task.error.message) || '生成失败',
          showCancel: false
        })
      } else if (task.status === 'partial') {
        app.toast('部分节点成功，可单独重试失败节点')
      } else if (task.status === 'succeeded') {
        app.toast(mode === 'demo' ? '演示目标图已生成' : '目标图已生成')
      }
    } catch (e) {
      wx.showModal({
        title: '提交失败',
        content: (e && e.message) || '无法创建目标任务',
        showCancel: false
      })
    } finally {
      this.setData({ busy: false })
    }
  },

  async onRetryNode(e) {
    const key = e.currentTarget.dataset.key
    const task = this.data.goalTask
    if (!task || !key) return
    const app = getApp()
    this.setData({ busy: true })
    try {
      const updated = await aiApi.retryAiTask(task.task_id, {
        node_key: key,
        base_revision: task.revision
      })
      this.setData({ goalTask: updated })
      if (updated.result && updated.result.group_id) {
        const group = await aiApi.getGoalGroup(updated.result.group_id)
        this.setData({ goalGroup: group })
      }
      app.toast('已重试节点 ' + key)
    } catch (err) {
      app.toast((err && err.message) || '重试失败')
    } finally {
      this.setData({ busy: false })
    }
  },

  async onExportNode(e) {
    const mediaId = e.currentTarget.dataset.media
    if (!mediaId) return
    try {
      const out = await aiApi.exportWatermark(mediaId)
      wx.showModal({
        title: '导出提醒',
        content:
          '水印：「' +
          (out.watermark_text || '') +
          '」已写入导出层。\n' +
          (out.share_scope_reminder || ''),
        showCancel: false
      })
    } catch (err) {
      getApp().toast((err && err.message) || '导出失败')
    }
  },

  async onConsult() {
    const app = getApp()
    const group = this.data.goalGroup
    const key = 'consult_once_' + ((group && group.group_id) || 'none')
    this.setData({ busy: true })
    try {
      // AC40：连续点两次同幂等键
      const a = await aiApi.createConsultation(
        {
          goal_group_id: group && group.group_id,
          goal_task_id: this.data.goalTask && this.data.goalTask.task_id,
          note: '想了解可达性与训练建议（咨询方案，非购买）'
        },
        key
      )
      const b = await aiApi.createConsultation(
        {
          goal_group_id: group && group.group_id,
          note: '想了解可达性与训练建议（咨询方案，非购买）'
        },
        key
      )
      if (a.consultation_id !== b.consultation_id) {
        app.toast('幂等异常')
      } else {
        app.toast('已提交咨询（未生成订单）')
      }
      this.loadConsultations()
    } catch (e) {
      wx.showModal({
        title: '咨询未创建',
        content: (e && e.message) || '请先绑定教练',
        showCancel: false
      })
    } finally {
      this.setData({ busy: false })
    }
  },

  loadConsultations() {
    aiApi
      .listConsultations()
      .then((list) => this.setData({ consultations: list || [] }))
      .catch(() => {})
  },

  async onCoachReview() {
    const report = this.data.postureReport
    if (!report) return
    const app = getApp()
    if (getApp().globalData.role !== 'coach') {
      app.toast('请切换教练视角复核')
      return
    }
    try {
      const updated = await aiApi.reviewPosture(report.report_id, {
        decision: 'reviewed',
        note: '同意观察方向，改善计划另发',
        base_revision: report.revision
      })
      this.setData({ postureReport: this.formatReport(updated) })
      app.toast('复核已写入（未覆盖 AI 原文）')
    } catch (e) {
      app.toast((e && e.message) || '复核失败')
    }
  },

  onOpenApiHint() {
    wx.showModal({
      title: '运行说明',
      content:
        'API: ' +
        config.API_BASE_URL +
        '\n演示与真实任务隔离；真实通道默认 AI_PROVIDER=unavailable，不得伪造成功。无 82 分总分。',
      showCancel: false
    })
  }
})
